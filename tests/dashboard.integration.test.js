'use strict';

// Integration tests for the teacher dashboard aggregation endpoint: scoping to
// the logged-in teacher, pending-attendance counts reacting to real marks, and
// omission of sections with no backing model. Skips gracefully if no mongod.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-dashboard';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let classA;
let studentIds;

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
        name: 'Dashboard Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Student', 'Attendance', 'Subject', 'TimetableEntry', 'Notice'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherAUser = await db.model('User').create({
    name: 'Dashboard Teacher A', email: 'dash-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'Dashboard Teacher B', email: 'dash-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'DASH-TA', personal: { firstName: 'Dash', lastName: 'TeacherA', phone: '9000000001', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'DASH-TB', personal: { firstName: 'Dash', lastName: 'TeacherB', phone: '9000000002', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '7', academicYear: '2024-25', sections: ['A'], classTeacher: teacherA._id });
  const classB = await db.model('Class').create({ name: '9', academicYear: '2024-25', sections: ['C'], classTeacher: teacherB._id });

  const students = await db.model('Student').create([
    { admissionNo: 'DASH-S1', rollNo: '1', personal: { firstName: 'One', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '7', section: 'A' } },
    { admissionNo: 'DASH-S2', rollNo: '2', personal: { firstName: 'Two', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '7', section: 'A' } },
  ]);
  studentIds = students.map((s) => String(s._id));
  // A student in Teacher B's class — must never show up in Teacher A's dashboard.
  await db.model('Student').create({
    admissionNo: 'DASH-S3', rollNo: '1', personal: { firstName: 'Three', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '9', section: 'C' },
  });

  const subject = await db.model('Subject').create({ name: 'General Studies', code: 'GS7', grades: ['7'] });

  const todayDow = new Date().getDay();
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: todayDow, period: 1,
  });
  // Teacher B's timetable entry — must never show up in Teacher A's todaysClasses.
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classB._id, section: 'C', subject: subject._id, staff: teacherB._id, dayOfWeek: todayDow, period: 1,
  });

  await db.model('Notice').create({
    title: 'Test notice', message: 'Hello teachers', category: 'general', audience: 'all', status: 'published',
  });

  teacherAToken = await login(teacherAUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('teacher dashboard', () => {
  it('returns only this teacher\'s scoped data, with a pending attendance task and no notifications key', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/dashboard/teacher')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    const { data } = res.body;

    expect(data.hasTeacherProfile).toBe(true);
    expect(data.overview.classesTaught).toBe(1);
    expect(data.overview.totalStudents).toBe(2);

    expect(data.todaysClasses).toHaveLength(1);
    expect(data.todaysClasses[0].class.id).toBe(String(classA._id));

    expect(data.pendingTasks).toHaveLength(1);
    expect(data.pendingTasks[0].classId).toBe(String(classA._id));
    expect(data.overview.attendanceMarkedToday).toEqual({ marked: 0, total: 2 });

    expect(data.announcements.length).toBeGreaterThanOrEqual(1);
    expect('notifications' in data).toBe(false);
  });

  it('drops the pending-attendance task once attendance is marked', async () => {
    if (!dbAvailable) return;
    const today = new Date().toISOString().slice(0, 10);
    const markRes = await request(app)
      .post('/api/v1/attendance')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        classId: String(classA._id),
        section: 'A',
        date: today,
        records: studentIds.map((studentId) => ({ studentId, status: 'present' })),
      });
    expect(markRes.status).toBe(200);

    const res = await request(app)
      .get('/api/v1/dashboard/teacher')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.body.data.pendingTasks).toHaveLength(0);
    expect(res.body.data.overview.attendanceMarkedToday).toEqual({ marked: 2, total: 2 });
  });
});
