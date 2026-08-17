'use strict';

// Integration tests for GET /reports/teacher: real report types (attendance,
// homework, syllabus) must cross-check against the exact source data seeded
// below; behaviour/exams must return an honest `available: false` rather
// than fabricated zeros; everything must stay scoped to the requesting
// teacher. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-reports-teacher';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;

async function login(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
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
        name: 'Teacher Reports Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    [
      'User', 'Teacher', 'Class', 'Subject', 'Student', 'TimetableEntry', 'Attendance',
      'Homework', 'Submission', 'SyllabusTopic', 'SyllabusProgress',
    ].map((name) => db.model(name).deleteMany({}))
  );

  const teacherAUser = await db.model('User').create({
    name: 'RPT Teacher A', email: 'rpt-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'RPT Teacher B', email: 'rpt-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'RPT-TA', personal: { firstName: 'RPT', lastName: 'A', phone: '9000000081', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  await db.model('Teacher').create({
    employeeId: 'RPT-TB', personal: { firstName: 'RPT', lastName: 'B', phone: '9000000082', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  // Teacher A is class-teacher of class A; teacher B owns nothing.
  classA = await db.model('Class').create({ name: '6', academicYear: '2024-25', sections: ['A'], classTeacher: teacherA._id });
  const subject = await db.model('Subject').create({ name: 'Mathematics', code: 'RPT-MATH', grades: ['6'] });

  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1,
  });

  const students = await db.model('Student').create([
    { admissionNo: 'RPT-S1', rollNo: '1', personal: { firstName: 'One', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '6', section: 'A' } },
    { admissionNo: 'RPT-S2', rollNo: '2', personal: { firstName: 'Two', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '6', section: 'A' } },
  ]);

  // Known attendance: day 1 both present; day 2 one present + one absent; day 3 holiday for both.
  // -> present=3, absent=1, holiday=2, total=6, denominator=4, percentage = 3/4*100 = 75.
  const d1 = new Date('2024-06-03T00:00:00.000Z');
  const d2 = new Date('2024-06-04T00:00:00.000Z');
  const d3 = new Date('2024-06-05T00:00:00.000Z');
  await db.model('Attendance').create([
    { academicYear: '2024-25', class: classA._id, section: 'A', student: students[0]._id, date: d1, status: 'present' },
    { academicYear: '2024-25', class: classA._id, section: 'A', student: students[1]._id, date: d1, status: 'present' },
    { academicYear: '2024-25', class: classA._id, section: 'A', student: students[0]._id, date: d2, status: 'present' },
    { academicYear: '2024-25', class: classA._id, section: 'A', student: students[1]._id, date: d2, status: 'absent' },
    { academicYear: '2024-25', class: classA._id, section: 'A', student: students[0]._id, date: d3, status: 'holiday' },
    { academicYear: '2024-25', class: classA._id, section: 'A', student: students[1]._id, date: d3, status: 'holiday' },
  ]);

  // Homework: 2 students on roster, 1 submitted+graded (marks 8), 1 not submitted.
  const hw = await db.model('Homework').create({
    teacher: teacherA._id, class: classA._id, section: 'A', subject: subject._id, academicYear: '2024-25',
    title: 'Fractions Worksheet', dueDate: new Date('2024-06-10'), status: 'assigned',
  });
  await db.model('Submission').create({
    homework: hw._id, student: students[0]._id, status: 'graded', marks: 8, submittedAt: new Date('2024-06-09'), gradedAt: new Date('2024-06-11'),
  });

  // Syllabus: one topic, planned periods 4, marked completed.
  const topic = await db.model('SyllabusTopic').create({
    academicYear: '2024-25', subject: subject._id, grade: '6', parent: null, title: 'Fractions', sequence: 1, plannedPeriods: 4,
  });
  await db.model('SyllabusProgress').create({
    academicYear: '2024-25', class: classA._id, section: 'A', topic: topic._id, status: 'completed', completedOn: new Date(),
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /reports/teacher — attendance (cross-checked against seeded records)', () => {
  it('computes the exact present/absent/holiday counts and percentage', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/reports/teacher')
      .query({ type: 'attendance', from: '2024-06-01', to: '2024-06-30' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.summary).toEqual(
      expect.objectContaining({ present: 3, absent: 1, late: 0, excused: 0, holiday: 2, total: 6, percentage: 75 })
    );
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toEqual(expect.objectContaining({ className: '6', section: 'A', percentage: 75 }));
  });

  it("is scoped — a teacher who isn't a class teacher gets the honest empty state, not another teacher's numbers", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/reports/teacher')
      .query({ type: 'attendance' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.rows).toHaveLength(0);
    expect(res.body.data.message).toMatch(/class teacher/i);
  });
});

describe('GET /reports/teacher — homework (cross-checked)', () => {
  it('computes submission/grading numbers matching the seeded roster + submission', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/reports/teacher')
      .query({ type: 'homework', from: '2024-06-01', to: '2024-06-30' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    const row = res.body.data.rows[0];
    expect(row.totalStudents).toBe(2);
    expect(row.submittedCount).toBe(1);
    expect(row.gradedCount).toBe(1);
    expect(row.averageMarks).toBe(8);
    expect(row.submissionRate).toBe(50);
  });
});

describe('GET /reports/teacher — syllabus coverage (reuses deriveCoverage, not duplicated math)', () => {
  it('reflects the one completed topic', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/reports/teacher')
      .query({ type: 'syllabus' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.rows).toHaveLength(1);
    expect(res.body.data.rows[0]).toEqual(
      expect.objectContaining({ className: '6', section: 'A', subjectName: 'Mathematics', coveragePercent: 100 })
    );
  });
});

describe('GET /reports/teacher — honest empty states for unavailable types', () => {
  it('behaviour returns available:false with an explicit message, never zeros', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/reports/teacher')
      .query({ type: 'behaviour' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(false);
    expect(res.body.data.summary).toBeNull();
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.message).toMatch(/behaviour/i);
  });

  it('exams returns available:false with an explicit message, never zeros', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/reports/teacher')
      .query({ type: 'exams' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(false);
    expect(res.body.data.summary).toBeNull();
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.message).toMatch(/exam/i);
  });
});
