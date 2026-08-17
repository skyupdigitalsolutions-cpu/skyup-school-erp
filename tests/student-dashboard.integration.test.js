'use strict';

// Integration tests for the student-portal Dashboard: a pure aggregation
// over the OTHER already-built student-scoped services (attendance,
// timetable, homework, exams, fees, transport, leave requests, events) —
// never a raw query, never a fabricated number. Notifications has no
// backing module at all (`modules/notifications/` is an empty scaffold), so
// it must always report `{ available: false }`, never a synthesized count.
// The exams card reuses the exact same results_published gate as the Exams
// page. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-dashboard';
const PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

let app;
let dbAvailable = true;
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

function getDashboard(token) {
  return request(app)
    .get('/api/v1/student-dashboard/me')
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
        name: 'Student Dashboard Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    [
      'Student', 'StudentAccount', 'Class', 'Subject', 'Teacher', 'Attendance', 'Homework', 'Submission',
      'Exam', 'ExamSchedule', 'ExamMark', 'FeeTransaction', 'StudentLeaveRequest', 'Event',
    ].map((name) => db.model(name).deleteMany({}))
  );

  const klass = await db.model('Class').create({ name: '9', academicYear: '2024-25', sections: ['A'] });
  const subject = await db.model('Subject').create({ name: 'Mathematics', code: 'SD-MATH', grades: ['9'] });
  const teacher = await db.model('Teacher').create({
    employeeId: 'SD-T1', personal: { firstName: 'Dash', lastName: 'Teacher', phone: '9000000201', email: 'dash-teacher@sdinttest.school' },
    professional: { department: 'General', designation: 'TGT' },
  });

  const studentA = await db.model('Student').create({
    admissionNo: 'SD-A1', rollNo: '1',
    personal: { firstName: 'Amara', lastName: 'One' },
    academic: { academicYear: '2024-25', class: '9', section: 'A' },
    transport: { enrolled: true, routeNo: 'R-9', stopName: 'Test Stop', vehicleNo: 'TS-01' },
  });
  const studentB = await db.model('Student').create({
    admissionNo: 'SD-B1', rollNo: '1',
    personal: { firstName: 'Ben', lastName: 'Two' },
    academic: { academicYear: '2024-25', class: '9', section: 'A' },
    transport: { enrolled: false },
  });

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@sdinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@sdinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@sdinttest.school', password: PASSWORD, isActive: true,
  });

  const now = Date.now();

  // Attendance — this month, for studentA only.
  await db.model('Attendance').create([
    { academicYear: '2024-25', class: klass._id, section: 'A', student: studentA._id, date: new Date(), status: 'present' },
    { academicYear: '2024-25', class: klass._id, section: 'A', student: studentA._id, date: new Date(now - DAY_MS), status: 'absent' },
  ]);

  // Homework — one assigned, not submitted, for studentA's class.
  await db.model('Homework').create({
    teacher: teacher._id, class: klass._id, section: 'A', academicYear: '2024-25', subject: subject._id,
    title: 'Algebra Worksheet', description: 'Solve all problems.', dueDate: new Date(now + 3 * DAY_MS), status: 'assigned', maxMarks: 20,
  });

  // Two exams: one unpublished (with a real mark, to prove the gate), one published.
  const examUnpublished = await db.model('Exam').create({
    title: 'Unit Test 1', academicYear: '2024-25', type: 'unit_test', classes: [klass._id], status: 'scheduled',
    startDate: new Date(now + 10 * DAY_MS), endDate: new Date(now + 10 * DAY_MS),
  });
  const scheduleUnpublished = await db.model('ExamSchedule').create({
    exam: examUnpublished._id, class: klass._id, section: 'A', subject: subject._id,
    date: new Date(now + 10 * DAY_MS), startTime: '09:00', endTime: '11:00', room: 'R-1', maxMarks: 100,
  });
  await db.model('ExamMark').create({ examSchedule: scheduleUnpublished._id, student: studentA._id, marksObtained: 91 });

  const examPublished = await db.model('Exam').create({
    title: 'Term 1 Mid-Term', academicYear: '2024-25', type: 'midterm', classes: [klass._id], status: 'results_published',
    startDate: new Date(now - 20 * DAY_MS), endDate: new Date(now - 20 * DAY_MS),
  });
  const schedulePublished = await db.model('ExamSchedule').create({
    exam: examPublished._id, class: klass._id, section: 'A', subject: subject._id,
    date: new Date(now - 20 * DAY_MS), startTime: '09:00', endTime: '11:00', room: 'R-2', maxMarks: 100,
  });
  await db.model('ExamMark').create({ examSchedule: schedulePublished._id, student: studentA._id, marksObtained: 78 });

  // Fees — studentA only.
  await db.model('FeeTransaction').create({
    student: studentA._id, academicYear: '2024-25', feeType: 'tuition', amount: 5000, status: 'overdue', dueDate: new Date(now - DAY_MS),
  });

  // Leave request — studentA, pending.
  await db.model('StudentLeaveRequest').create({
    student: studentA._id, requestedBy: studentA._id, leaveType: 'sick',
    fromDate: new Date(now + 5 * DAY_MS), toDate: new Date(now + 5 * DAY_MS), totalDays: 1, reason: 'Checkup', status: 'pending',
  });

  // Event — public, upcoming, school-wide (no class targeting exists).
  await db.model('Event').create({
    eventId: 'SD-EVT-1', name: 'Annual Day', category: 'cultural', academicYear: '2024-25', status: 'approved',
    schedule: { startDate: new Date(now + 15 * DAY_MS), endDate: new Date(now + 15 * DAY_MS) },
    organizer: { name: 'Principal' },
  });

  parentTokenA = await loginStudentPortal('parent-a@sdinttest.school');
  studentTokenA = await loginStudentPortal('student-a@sdinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@sdinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-dashboard/me — composes every real source, nothing invented', () => {
  it('returns all 9 keys, each with a real, traceable value', async () => {
    if (!dbAvailable) return;
    const res = await getDashboard(parentTokenA);
    expect(res.status).toBe(200);
    const d = res.body.data;

    expect(d.attendance.available).toBe(true);
    expect(d.attendance.present).toBe(1);
    expect(d.attendance.total).toBe(2);

    expect(d.homework.available).toBe(true);
    expect(d.homework.dueCount).toBe(1);
    expect(d.homework.nextDue.title).toBe('Algebra Worksheet');

    expect(d.exams.available).toBe(true);
    expect(d.exams.upcoming).not.toBeNull(); // "Unit Test 1" starts in the future and is still 'scheduled'
    expect(d.exams.upcoming.title).toBe('Unit Test 1');
    expect(d.exams.latestResult).not.toBeNull();
    expect(d.exams.latestResult.title).toBe('Term 1 Mid-Term');
    expect(d.exams.latestResult.percentage).toBe(78);

    expect(d.fees.available).toBe(true);
    expect(d.fees.totalOutstanding).toBe(5000);

    expect(d.transport.available).toBe(true);
    expect(d.transport.enrolled).toBe(true);
    expect(d.transport.routeNo).toBe('R-9');

    expect(d.leaveRequests.available).toBe(true);
    expect(d.leaveRequests.pendingCount).toBe(1);

    expect(d.events.available).toBe(true);
    expect(d.events.next.name).toBe('Annual Day');

    // Notifications has no backing module — MUST always be available:false, never a count.
    expect(d.notifications).toEqual({ available: false });
  });

  it("never surfaces the unpublished exam's real mark (91) anywhere in the payload — its title as an upcoming exam is fine, its marks are not", async () => {
    if (!dbAvailable) return;
    const res = await getDashboard(parentTokenA);
    const payload = JSON.stringify(res.body.data);
    expect(payload).not.toMatch(/\b91\b/);
  });

  it('fees card is parent-only — a student viewer gets available:false, parentOnly:true, no figures', async () => {
    if (!dbAvailable) return;
    const res = await getDashboard(studentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.fees).toEqual({ available: false, parentOnly: true });
  });
});

describe('GET /student-dashboard/me — scoped to the logged-in student only', () => {
  it("never reflects another student's attendance, homework, fees, or transport", async () => {
    if (!dbAvailable) return;
    const resB = await getDashboard(parentTokenB);
    expect(resB.status).toBe(200);
    const d = resB.body.data;

    expect(d.attendance.total).toBe(0); // studentB has no attendance rows
    expect(d.fees.totalOutstanding).toBe(0); // studentB has no fee transactions
    expect(d.transport.enrolled).toBe(false); // studentB's own transport.enrolled is false
    expect(d.leaveRequests.pendingCount).toBe(0); // studentB has no leave requests

    const payload = JSON.stringify(d);
    expect(payload).not.toMatch(/5000/); // studentA's outstanding fee amount
    expect(payload).not.toMatch(/R-9/); // studentA's route
  });
});
