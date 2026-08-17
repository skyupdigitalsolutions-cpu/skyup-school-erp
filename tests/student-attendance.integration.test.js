'use strict';

// Integration tests for the student/parent read-only Attendance view: the
// summary/percentage numbers must match the underlying Attendance rows
// exactly (holidays excluded from the denominator, reusing
// AttendanceService.computeSummary/percentageFromSummary verbatim), the
// endpoint is scoped to the logged-in student only, and it's read-only (GET
// only — no marking route exists on this module). Skips gracefully if no
// mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-attendance';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let studentA;
let studentB;
let parentTokenA;
let studentTokenA;
let parentTokenB;

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function getAttendance(token, query) {
  return request(app)
    .get('/api/v1/student-attendance/me')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${token}`)
    .query(query);
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
        name: 'Student Attendance Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['Class', 'Student', 'StudentAccount', 'Attendance'].map((name) => db.model(name).deleteMany({}))
  );

  const klass = await db.model('Class').create({ name: '5', academicYear: '2024-25', sections: ['A'] });

  const students = await db.model('Student').create([
    {
      admissionNo: 'SA-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    },
    {
      admissionNo: 'SA-B1', rollNo: '2',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    },
  ]);
  studentA = students[0];
  studentB = students[1];

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@sainttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@sainttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@sainttest.school', password: PASSWORD, isActive: true,
  });

  // Student A: 10 days in August 2024 — 5 present, 2 absent, 1 late, 1 excused, 1 holiday.
  const rowsA = [
    { date: '2024-08-01', status: 'present' },
    { date: '2024-08-02', status: 'present' },
    { date: '2024-08-03', status: 'absent' },
    { date: '2024-08-04', status: 'late' },
    { date: '2024-08-05', status: 'holiday' },
    { date: '2024-08-06', status: 'present' },
    { date: '2024-08-07', status: 'excused' },
    { date: '2024-08-08', status: 'present' },
    { date: '2024-08-09', status: 'absent' },
    { date: '2024-08-10', status: 'present' },
  ];
  await db.model('Attendance').create(
    rowsA.map((r) => ({
      academicYear: '2024-25', class: klass._id, section: 'A', student: studentA._id,
      date: new Date(`${r.date}T00:00:00.000Z`), status: r.status,
    }))
  );

  // Student B: a single present day — must never bleed into A's summary.
  await db.model('Attendance').create({
    academicYear: '2024-25', class: klass._id, section: 'A', student: studentB._id,
    date: new Date('2024-08-01T00:00:00.000Z'), status: 'present',
  });

  parentTokenA = await loginStudentPortal('parent-a@sainttest.school');
  studentTokenA = await loginStudentPortal('student-a@sainttest.school');
  parentTokenB = await loginStudentPortal('parent-b@sainttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-attendance/me — summary matches the source rows', () => {
  it('computes present/absent/late/excused/holiday counts and % (holidays excluded) exactly', async () => {
    if (!dbAvailable) return;
    const res = await getAttendance(parentTokenA, { from: '2024-08-01', to: '2024-08-10' });
    expect(res.status).toBe(200);
    expect(res.body.data.studentId).toBe(String(studentA._id));

    const { summary } = res.body.data;
    expect(summary.total).toBe(10);
    expect(summary.present).toBe(5);
    expect(summary.absent).toBe(2);
    expect(summary.late).toBe(1);
    expect(summary.excused).toBe(1);
    expect(summary.holiday).toBe(1);
    // denominator = 10 - 1 holiday = 9; 5/9 = 55.6% (rounded to 1 decimal).
    expect(summary.percentage).toBe(55.6);
  });

  it('returns a day-by-day breakdown that matches the seeded rows, sorted ascending', async () => {
    if (!dbAvailable) return;
    const res = await getAttendance(parentTokenA, { from: '2024-08-01', to: '2024-08-10' });
    expect(res.body.data.days).toHaveLength(10);
    expect(res.body.data.days[0]).toMatchObject({ date: '2024-08-01', status: 'present' });
    expect(res.body.data.days[4]).toMatchObject({ date: '2024-08-05', status: 'holiday' });
    expect(res.body.data.days[9]).toMatchObject({ date: '2024-08-10', status: 'present' });
  });

  it('returns a month rollup matching the same totals', async () => {
    if (!dbAvailable) return;
    const res = await getAttendance(parentTokenA, { from: '2024-08-01', to: '2024-08-10' });
    expect(res.body.data.monthly).toHaveLength(1);
    expect(res.body.data.monthly[0]).toMatchObject({ month: '2024-08', total: 10, present: 5, percentage: 55.6 });
  });

  it('is identical for the parent and student viewer of the same student — attendance is not fee-gated', async () => {
    if (!dbAvailable) return;
    const parentRes = await getAttendance(parentTokenA, { from: '2024-08-01', to: '2024-08-10' });
    const studentRes = await getAttendance(studentTokenA, { from: '2024-08-01', to: '2024-08-10' });
    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data.summary).toEqual(parentRes.body.data.summary);
  });

  it('rejects a request missing the from/to range', async () => {
    if (!dbAvailable) return;
    const res = await getAttendance(parentTokenA, {});
    expect(res.status).toBe(422);
  });
});

describe('GET /student-attendance/me — scoped to the logged-in student only', () => {
  it("never includes another student's attendance rows", async () => {
    if (!dbAvailable) return;
    const res = await getAttendance(parentTokenB, { from: '2024-08-01', to: '2024-08-10' });
    expect(res.status).toBe(200);
    expect(res.body.data.studentId).toBe(String(studentB._id));
    expect(res.body.data.studentId).not.toBe(String(studentA._id));
    expect(res.body.data.summary.total).toBe(1);
    expect(res.body.data.summary.present).toBe(1);
  });
});
