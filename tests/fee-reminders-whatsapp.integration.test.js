'use strict';

// Integration tests for the bulk WhatsApp fee-reminder feature: the
// due-this-month list (real ledger aggregation, not a client-trusted
// figure), the bulk-send endpoint (fresh per-student recompute at send
// time, one FeeReminder audit row per student, one bad number never
// blocking the rest of the batch), and the "not configured" guardrail.
// `global.fetch` is mocked so no real network call is ever made — the
// mock lets us prove one deliberately-"invalid" student fails while
// the others succeed, exactly the scenario the brief asked to prove.
// Skips gracefully if no mongod is reachable.

// WhatsApp config must be set BEFORE `../src/config` is first required
// (transitively, by `../src/app` below) — dotenv.config() never overrides
// an already-set process.env value, so these win.
process.env.WHATSAPP_API_URL = 'https://mock.msg91.test/send';
process.env.WHATSAPP_API_TOKEN = 'mock-token';
process.env.WHATSAPP_SENDER_NUMBER = '910000000000';
process.env.WHATSAPP_TEMPLATE_NAME = 'fee_due_reminder';

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-fee-reminders-wa';
const PASSWORD = 'Password123!';

let app;
let dbAvailable = true;
let financeToken;
let teacherToken;
let studentGood; // real phone — mock will report success
let studentBad; // real phone, but the deliberately-"invalid" one — mock reports a provider failure
let studentNoPhone; // no parent contact at all
let studentPaidUp; // has no due FeeTransaction for the test month at all

const TEST_MONTH = '2025-06';
const DUE_DATE = new Date('2025-06-15T00:00:00.000Z');

function mockFetchImplementation() {
  return jest.fn(async (url, opts) => {
    const body = JSON.parse(opts.body);
    const to = body.payload.template.to_and_components[0].to[0];
    if (to === '9000000666') {
      // The deliberately-invalid number — simulate MSG91 reporting an error.
      return {
        ok: true, // MSG91 can return HTTP 200 with hasError:true
        json: async () => ({ status: 'error', hasError: true, message: 'Invalid recipient number.' }),
      };
    }
    return {
      ok: true,
      json: async () => ({ status: 'success', hasError: false, data: 'queued', request_id: `mock-${to}` }),
    };
  });
}

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
    { $set: { slug: TENANT_SLUG, name: 'Fee Reminders WA Test School', dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`, status: 'active' } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(['User', 'Student', 'FeeTransaction', 'FeeReminder'].map((name) => db.model(name).deleteMany({})));

  await db.model('User').create({ name: 'Finance User', email: 'finance@waremtest.school', password: PASSWORD, roles: ['finance'], status: 'active' });
  await db.model('User').create({ name: 'Teacher User', email: 'teacher@waremtest.school', password: PASSWORD, roles: ['teacher'], status: 'active' });

  studentGood = await db.model('Student').create({
    admissionNo: 'WA-1', rollNo: '1', personal: { firstName: 'Good', lastName: 'One' },
    academic: { academicYear: '2024-25', class: '5', section: 'A' },
    parent: { father: { name: 'Papa Good', phone: '9000000111' }, primaryContact: 'father' },
  });
  studentBad = await db.model('Student').create({
    admissionNo: 'WA-2', rollNo: '2', personal: { firstName: 'Bad', lastName: 'Two' },
    academic: { academicYear: '2024-25', class: '5', section: 'A' },
    parent: { father: { name: 'Papa Bad', phone: '9000000666' }, primaryContact: 'father' },
  });
  studentNoPhone = await db.model('Student').create({
    admissionNo: 'WA-3', rollNo: '3', personal: { firstName: 'NoPhone', lastName: 'Three' },
    academic: { academicYear: '2024-25', class: '5', section: 'A' },
    // no `parent` at all
  });
  studentPaidUp = await db.model('Student').create({
    admissionNo: 'WA-4', rollNo: '4', personal: { firstName: 'PaidUp', lastName: 'Four' },
    academic: { academicYear: '2024-25', class: '5', section: 'A' },
    parent: { father: { name: 'Papa PaidUp', phone: '9000000444' }, primaryContact: 'father' },
  });

  await db.model('FeeTransaction').create([
    { student: studentGood._id, academicYear: '2024-25', feeType: 'tuition', amount: 5000, status: 'overdue', dueDate: DUE_DATE },
    { student: studentBad._id, academicYear: '2024-25', feeType: 'tuition', amount: 3000, status: 'pending', dueDate: DUE_DATE },
    { student: studentNoPhone._id, academicYear: '2024-25', feeType: 'tuition', amount: 2000, status: 'overdue', dueDate: DUE_DATE },
    // studentPaidUp has a transaction, but it's PAID — must not appear in the due list.
    { student: studentPaidUp._id, academicYear: '2024-25', feeType: 'tuition', amount: 4000, status: 'paid', dueDate: DUE_DATE, paidDate: DUE_DATE },
  ]);

  financeToken = await login('finance@waremtest.school');
  teacherToken = await login('teacher@waremtest.school');
}, 30000);

afterEach(() => {
  if (global.fetch && global.fetch.mockRestore) global.fetch.mockRestore();
});

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /finance/reminders/due — real ledger aggregation, spot-checkable', () => {
  it('returns exactly the students with a real unpaid amount due that month, correct amounts', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get(`/api/v1/finance/reminders/due?month=${TEST_MONTH}`);
    expect(res.status).toBe(200);

    const names = res.body.data.map((r) => r.studentName);
    expect(names).toContain('Good One');
    expect(names).toContain('Bad Two');
    expect(names).toContain('NoPhone Three');
    expect(names).not.toContain('PaidUp Four'); // fully paid — must never appear

    const good = res.body.data.find((r) => r.studentName === 'Good One');
    expect(good.dueAmount).toBe(5000); // spot-check against the seeded ledger row directly
    const bad = res.body.data.find((r) => r.studentName === 'Bad Two');
    expect(bad.dueAmount).toBe(3000);
  });

  it("includes each student's real parent contact, or null when none exists — never fabricated", async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get(`/api/v1/finance/reminders/due?month=${TEST_MONTH}`);
    const good = res.body.data.find((r) => r.studentName === 'Good One');
    expect(good.parentContact).toEqual({ name: 'Papa Good', phone: '9000000111', relation: 'father' });
    const noPhone = res.body.data.find((r) => r.studentName === 'NoPhone Three');
    expect(noPhone.parentContact).toBeNull();
  });
});

describe('GET /finance/reminders/whatsapp-status', () => {
  it('reports configured:true once all 4 env vars are set (as this test file sets them)', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).get('/api/v1/finance/reminders/whatsapp-status');
    expect(res.status).toBe(200);
    expect(res.body.data.configured).toBe(true);
  });
});

describe('POST /finance/reminders/bulk-send — real per-student send, one failure never blocks the batch', () => {
  it('sends to the good student, fails the deliberately-invalid one, and fails the no-phone one — all in the SAME batch', async () => {
    if (!dbAvailable) return;
    global.fetch = mockFetchImplementation();

    const res = await api(financeToken).post('/api/v1/finance/reminders/bulk-send', {
      studentIds: [String(studentGood._id), String(studentBad._id), String(studentNoPhone._id)],
      month: TEST_MONTH,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBe(1);
    expect(res.body.data.failed).toBe(2);

    const byId = Object.fromEntries(res.body.data.results.map((r) => [r.studentId, r]));
    expect(byId[String(studentGood._id)].status).toBe('sent');
    expect(byId[String(studentBad._id)].status).toBe('failed');
    expect(byId[String(studentBad._id)].errorMessage).toMatch(/invalid recipient/i);
    expect(byId[String(studentNoPhone._id)].status).toBe('failed');
    expect(byId[String(studentNoPhone._id)].errorMessage).toMatch(/no whatsapp-capable phone/i);
  });

  it('substituted the CORRECT per-student name and amount into the template call', async () => {
    if (!dbAvailable) return;
    const fetchMock = mockFetchImplementation();
    global.fetch = fetchMock;

    await api(financeToken).post('/api/v1/finance/reminders/bulk-send', {
      studentIds: [String(studentGood._id)], month: TEST_MONTH,
    });

    const [, opts] = fetchMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    const params = body.payload.template.to_and_components[0].components[0].parameters;
    expect(params[0].text).toBe('Good One');
    expect(params[1].text).toBe('5,000');
  });

  it('a student with nothing currently due (paid since the list loaded) fails honestly, never fabricating an amount', async () => {
    if (!dbAvailable) return;
    global.fetch = mockFetchImplementation();
    const res = await api(financeToken).post('/api/v1/finance/reminders/bulk-send', {
      studentIds: [String(studentPaidUp._id)], month: TEST_MONTH,
    });
    expect(res.body.data.failed).toBe(1);
    expect(res.body.data.results[0].errorMessage).toMatch(/no amount currently due/i);
  });

  it('writes one FeeReminder audit row per student, queryable per student like the manual-log path', async () => {
    if (!dbAvailable) return;
    global.fetch = mockFetchImplementation();
    await api(financeToken).post('/api/v1/finance/reminders/bulk-send', {
      studentIds: [String(studentGood._id)], month: TEST_MONTH,
    });

    const history = await api(financeToken).get(`/api/v1/finance/reminders?student=${studentGood._id}`);
    expect(history.status).toBe(200);
    const sentRow = history.body.data.find((r) => r.status === 'sent' && r.channel === 'whatsapp');
    expect(sentRow).toBeTruthy();
    expect(sentRow.amount).toBe(5000);
    expect(sentRow.providerMessageId).toBeTruthy();
  });

  it('a non-finance/principal/administrator role is refused', async () => {
    if (!dbAvailable) return;
    const res = await api(teacherToken).post('/api/v1/finance/reminders/bulk-send', { studentIds: [String(studentGood._id)] });
    expect(res.status).toBe(403);
  });
});

describe('WhatsApp not configured — the guardrail', () => {
  const ORIGINAL = { ...config.notifications };

  afterEach(() => {
    Object.assign(config.notifications, ORIGINAL); // config is frozen at the top level but notifications is a plain nested object — restore after mutating for this block
  });

  it('bulk-send refuses cleanly (400) when a required piece of config is missing, without sending anything', async () => {
    if (!dbAvailable) return;
    config.notifications.whatsappTemplateName = '';
    global.fetch = jest.fn(); // must never be called

    const res = await api(financeToken).post('/api/v1/finance/reminders/bulk-send', {
      studentIds: [String(studentGood._id)], month: TEST_MONTH,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/configured/i);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('whatsapp-status reports configured:false when unconfigured', async () => {
    if (!dbAvailable) return;
    config.notifications.whatsappTemplateName = '';
    const res = await api(financeToken).get('/api/v1/finance/reminders/whatsapp-status');
    expect(res.body.data.configured).toBe(false);
  });
});
