'use strict';

// Integration tests for the Finance-role dashboard feature: read-only access
// to the fee ledger + a new dashboard summary endpoint, log-only reminders,
// and the one genuine write area — Expense logging with reversal-only
// correction (no PUT, no hard delete). Confirms the Finance role can GET the
// existing finance routes but is refused on every POST/PUT/DELETE there.
// Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-finance-dashboard';
const PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

let app;
let dbAvailable = true;
let financeToken;
let principalToken;
let teacherToken;
let studentDoc;

async function login(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function api(token) {
  const withAuth = (req) => req.set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`);
  return {
    get: (path) => withAuth(request(app).get(path)),
    post: (path, body) => withAuth(request(app).post(path).send(body)),
    put: (path, body) => withAuth(request(app).put(path).send(body)),
    delete: (path) => withAuth(request(app).delete(path)),
  };
}

beforeAll(async () => {
  try {
    await connectionManager.connect();
  } catch (err) {
    dbAvailable = false;
    return;
  }

  app = createApp();

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOneAndUpdate(
    { slug: TENANT_SLUG },
    {
      $set: {
        slug: TENANT_SLUG,
        name: 'Finance Dashboard Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Student', 'Teacher', 'FeeTransaction', 'FeeReminder', 'Expense'].map((name) => db.model(name).deleteMany({}))
  );

  await db.model('User').create({ name: 'Finance User', email: 'finance@fdinttest.school', password: PASSWORD, roles: ['finance'], status: 'active' });
  await db.model('User').create({ name: 'Principal User', email: 'principal@fdinttest.school', password: PASSWORD, roles: ['principal'], status: 'active' });
  await db.model('User').create({ name: 'Teacher User', email: 'teacher@fdinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active' });

  studentDoc = await db.model('Student').create({
    admissionNo: 'FD-1', rollNo: '1',
    personal: { firstName: 'Amara', lastName: 'One' },
    academic: { academicYear: '2024-25', class: '5', section: 'A' },
  });

  await db.model('Teacher').create({
    employeeId: 'FD-T1', personal: { firstName: 'Teach', lastName: 'One', phone: '9000000401', email: 'teach-one@fdinttest.school' },
    professional: { department: 'General', designation: 'TGT' },
    status: 'active',
    payroll: { basicSalary: 30000, grossSalary: 45000 },
  });
  await db.model('Teacher').create({
    employeeId: 'FD-T2', personal: { firstName: 'Teach', lastName: 'Two', phone: '9000000402', email: 'teach-two@fdinttest.school' },
    professional: { department: 'General', designation: 'TGT' },
    status: 'inactive', // must be excluded from payrollTotal
    payroll: { basicSalary: 99999, grossSalary: 99999 },
  });

  const now = Date.now();
  await db.model('FeeTransaction').create([
    { student: studentDoc._id, academicYear: '2024-25', feeType: 'tuition', amount: 20000, status: 'paid', paidDate: new Date(now - 5 * DAY_MS) },
    { student: studentDoc._id, academicYear: '2024-25', feeType: 'transport', amount: 5000, status: 'overdue', dueDate: new Date(now - 10 * DAY_MS) },
    { student: studentDoc._id, academicYear: '2024-25', feeType: 'exam', amount: 2000, status: 'partial' },
  ]);

  financeToken = await login('finance@fdinttest.school');
  principalToken = await login('principal@fdinttest.school');
  teacherToken = await login('teacher@fdinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('Finance role — GET-only on existing /finance routes', () => {
  it('can GET /finance/stats', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get('/api/v1/finance/stats');
    expect(res.status).toBe(200);
  });

  it('can GET /finance (list)', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get('/api/v1/finance');
    expect(res.status).toBe(200);
  });

  it('is refused POST /finance (collecting a payment)', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post('/api/v1/finance', {
      student: studentDoc._id, academicYear: '2024-25', feeType: 'tuition', amount: 1000, status: 'paid',
    });
    expect(res.status).toBe(403);
  });

  it('is refused PUT /finance/:id and DELETE /finance/:id', async () => {
    if (!dbAvailable) return;
    const txn = await request(app); // placeholder — reuse an id via list
    const list = await api(principalToken).get('/api/v1/finance');
    const id = list.body.data[0]._id;
    const putRes = await api(financeToken).put(`/api/v1/finance/${id}`, { amount: 1 });
    const delRes = await api(financeToken).delete(`/api/v1/finance/${id}`);
    expect(putRes.status).toBe(403);
    expect(delRes.status).toBe(403);
    void txn;
  });
});

describe('GET /finance/dashboard/summary — every figure traces to a real collection', () => {
  it('reconciles totalOutstanding/totalCollected/payrollTotal against a manual sum', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get('/api/v1/finance/dashboard/summary?academicYear=2024-25');
    expect(res.status).toBe(200);
    const d = res.body.data;

    // Manual reconciliation: paid=20000; outstanding = overdue(5000) + partial(2000) = 7000.
    expect(d.totalCollected).toBe(20000);
    expect(d.totalOutstanding).toBe(7000);
    expect(d.defaultersCount).toBe(1);
    // Only the active teacher's grossSalary (45000) counts — the inactive one (99999) is excluded.
    expect(d.payrollTotal).toBe(45000);
    expect(d.expensesThisMonth).toBe(0);
    expect(d.expensesByCategory).toEqual({ maintenance: 0, infrastructure: 0, stationery: 0, cca: 0 });
  });

  it('is refused to teacher/student roles (not principal/admin/finance)', async () => {
    if (!dbAvailable) return;
    const res = await api(teacherToken).get('/api/v1/finance/dashboard/summary');
    expect(res.status).toBe(403);
  });
});

describe('Fee reminders — log-only, never "sent"', () => {
  it('logs a reminder with status always "logged"', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post('/api/v1/finance/reminders', {
      student: studentDoc._id, channel: 'manual_note', message: 'Please clear the overdue transport fee.',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('logged');
  });

  it('lists reminder history scoped to a student', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get(`/api/v1/finance/reminders?student=${studentDoc._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((r) => r.status === 'logged')).toBe(true);
  });
});

describe('Expense tracking — Finance writes, reversal-only correction', () => {
  let expenseId;

  it('creates a maintenance expense', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post('/api/v1/expenses', {
      category: 'maintenance', subCategory: 'housekeeping', amount: 3000, academicYear: '2024-25', vendor: 'Clean Co',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('recorded');
    expenseId = res.body.data._id;
  });

  it('rejects a negative amount at creation (only reverse() may produce one)', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post('/api/v1/expenses', {
      category: 'stationery', amount: -500, academicYear: '2024-25',
    });
    expect(res.status).toBe(422);
  });

  it('has no PUT or hard DELETE route at all (route not found, not just forbidden)', async () => {
    if (!dbAvailable) return;
    const putRes = await api(financeToken).put(`/api/v1/expenses/${expenseId}`, { amount: 1 });
    const delRes = await api(financeToken).delete(`/api/v1/expenses/${expenseId}`);
    expect(putRes.status).toBe(404);
    expect(delRes.status).toBe(404);
  });

  it('reversal creates a NEW row and flips the original — never mutates the original amount', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post(`/api/v1/expenses/${expenseId}/reverse`, { remarks: 'Entered twice by mistake.' });
    expect(res.status).toBe(200);
    expect(res.body.data.original.status).toBe('reversed');
    expect(res.body.data.original.amount).toBe(3000); // unchanged
    expect(res.body.data.reversal.amount).toBe(-3000);
    expect(res.body.data.reversal.reversalOf).toBe(expenseId);
  });

  it('refuses to reverse an already-reversed expense (409)', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post(`/api/v1/expenses/${expenseId}/reverse`, {});
    expect(res.status).toBe(409);
  });

  it("the dashboard's expense totals reconcile: a fully reversed entry nets to zero", async () => {
    if (!dbAvailable) return;
    const statsRes = await api(financeToken).get('/api/v1/expenses/stats?academicYear=2024-25');
    expect(statsRes.status).toBe(200);
    // 3000 (original, still summed even though status=reversed) + -3000 (reversal) = 0.
    expect(statsRes.body.data.byCategory.maintenance).toBe(0);
  });

  it('teacher/student roles are refused on expense routes', async () => {
    if (!dbAvailable) return;
    const res = await api(teacherToken).get('/api/v1/expenses');
    expect(res.status).toBe(403);
  });
});
