'use strict';

// Integration tests for the student-portal Fees view: PARENT-ONLY at the
// route (a student-viewer token is rejected with 403, not just hidden from
// nav), scoped to the logged-in student's own FeeTransaction rows only, and
// the summary totals are a real aggregation over those rows — paid +
// outstanding must equal billed, refunded rows excluded from all three, and
// the overall status reflects any real 'overdue' row. Skips gracefully if no
// mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-fees';
const PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

let app;
let db;
let dbAvailable = true;
let parentTokenA;
let studentTokenA; // same student as parentTokenA, viewerType 'student'
let parentTokenB;

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function getFees(token) {
  return request(app)
    .get('/api/v1/student-fees/me')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${token}`);
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
        name: 'Student Fees Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['Student', 'StudentAccount', 'FeeTransaction'].map((name) => db.model(name).deleteMany({}))
  );

  const students = await db.model('Student').create([
    {
      admissionNo: 'SF-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    },
    {
      admissionNo: 'SF-B1', rollNo: '1',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '5', section: 'B' },
    },
  ]);
  const [studentA, studentB] = students;

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@sfinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@sfinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@sfinttest.school', password: PASSWORD, isActive: true,
  });

  const now = Date.now();
  await db.model('FeeTransaction').create([
    {
      student: studentA._id, academicYear: '2024-25', feeType: 'tuition', amount: 15000,
      status: 'paid', paymentMode: 'upi', transactionRef: 'TXN-A001', paidDate: new Date(now - 10 * DAY_MS),
    },
    {
      student: studentA._id, academicYear: '2024-25', feeType: 'transport', amount: 5000,
      status: 'overdue', dueDate: new Date(now - 3 * DAY_MS),
    },
    {
      student: studentA._id, academicYear: '2024-25', feeType: 'exam', amount: 2000,
      status: 'partial', dueDate: new Date(now + 7 * DAY_MS),
    },
    {
      student: studentA._id, academicYear: '2024-25', feeType: 'hostel', amount: 3000,
      status: 'refunded', paidDate: new Date(now - 20 * DAY_MS),
    },
  ]);
  await db.model('FeeTransaction').create({
    student: studentB._id, academicYear: '2024-25', feeType: 'tuition', amount: 10000,
    status: 'paid', paymentMode: 'cash', paidDate: new Date(now - 5 * DAY_MS),
  });

  parentTokenA = await loginStudentPortal('parent-a@sfinttest.school');
  studentTokenA = await loginStudentPortal('student-a@sfinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@sfinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-fees/me — PARENT-ONLY gate', () => {
  it('rejects a student viewer with 403, at the route — not just hidden nav', async () => {
    if (!dbAvailable) return;
    const res = await getFees(studentTokenA);
    expect(res.status).toBe(403);
  });

  it('allows a parent viewer with 200', async () => {
    if (!dbAvailable) return;
    const res = await getFees(parentTokenA);
    expect(res.status).toBe(200);
  });
});

describe('GET /student-fees/me — summary matches the real ledger', () => {
  it('sums billed/paid/outstanding exactly, excluding the refunded row', async () => {
    if (!dbAvailable) return;
    const res = await getFees(parentTokenA);
    const { summary } = res.body.data;
    // billed = 15000 (paid) + 5000 (overdue) + 2000 (partial) — the 3000 refunded row is excluded.
    expect(summary.totalBilled).toBe(22000);
    expect(summary.totalPaid).toBe(15000);
    expect(summary.totalOutstanding).toBe(7000);
    expect(summary.totalPaid + summary.totalOutstanding).toBe(summary.totalBilled);
  });

  it("derives overall status 'overdue' because a real row is overdue", async () => {
    if (!dbAvailable) return;
    const res = await getFees(parentTokenA);
    expect(res.body.data.summary.status).toBe('overdue');
    expect(res.body.data.summary.nextDueDate).not.toBeNull();
  });

  it('derives overall status "paid" when everything billed has been paid', async () => {
    if (!dbAvailable) return;
    const res = await getFees(parentTokenB);
    const { summary } = res.body.data;
    expect(summary.totalBilled).toBe(10000);
    expect(summary.totalPaid).toBe(10000);
    expect(summary.totalOutstanding).toBe(0);
    expect(summary.status).toBe('paid');
  });

  it('lists every transaction as an invoice, and only paid ones as receipts', async () => {
    if (!dbAvailable) return;
    const res = await getFees(parentTokenA);
    expect(res.body.data.invoices).toHaveLength(4);
    expect(res.body.data.receipts).toHaveLength(1);
    expect(res.body.data.receipts[0].receiptNo).toBe('TXN-A001');
    expect(res.body.data.receipts[0].amount).toBe(15000);
  });
});

describe('GET /student-fees/me — scoped to the logged-in student only', () => {
  it("never includes another student's fee transactions", async () => {
    if (!dbAvailable) return;
    const resA = await getFees(parentTokenA);
    const resB = await getFees(parentTokenB);
    expect(resA.body.data.invoices).toHaveLength(4);
    expect(resB.body.data.invoices).toHaveLength(1);
    expect(resB.body.data.invoices[0].amount).toBe(10000);
    expect(resB.body.data.summary.totalBilled).not.toBe(resA.body.data.summary.totalBilled);
  });
});
