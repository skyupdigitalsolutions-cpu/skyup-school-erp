'use strict';

// Integration tests for the teacher homework module: creation is scoped to
// classes the teacher actually teaches, the submission tracker returns the
// real roster, and grading is restricted to the owning teacher. Skips
// gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-homework';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;
let classB;
let subject;
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
        name: 'Homework Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Student', 'Subject', 'TimetableEntry', 'Homework', 'Submission'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherAUser = await db.model('User').create({
    name: 'HW Teacher A', email: 'hw-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'HW Teacher B', email: 'hw-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'HW-TA', personal: { firstName: 'HW', lastName: 'A', phone: '9000000031', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'HW-TB', personal: { firstName: 'HW', lastName: 'B', phone: '9000000032', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '3', academicYear: '2024-25', sections: ['A'] });
  classB = await db.model('Class').create({ name: '2', academicYear: '2024-25', sections: ['B'] });
  subject = await db.model('Subject').create({ name: 'General Studies', code: 'HW-GS', grades: ['2', '3'] });

  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1,
  });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classB._id, section: 'B', subject: subject._id, staff: teacherB._id, dayOfWeek: 1, period: 1,
  });

  const students = await db.model('Student').create([
    { admissionNo: 'HW-S1', rollNo: '1', personal: { firstName: 'One', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '3', section: 'A' } },
    { admissionNo: 'HW-S2', rollNo: '2', personal: { firstName: 'Two', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '3', section: 'A' } },
  ]);
  studentIds = students.map((s) => String(s._id));

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

let homeworkId;

describe('POST /homework — scoping', () => {
  it('succeeds for a class the teacher teaches', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/homework')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classA._id), section: 'A', subject: String(subject._id),
        title: 'Worksheet 1', dueDate: '2099-01-01', maxMarks: 10, status: 'assigned',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Worksheet 1');
    homeworkId = res.body.data._id;
  });

  it('is rejected for a class the teacher does NOT teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/homework')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classB._id), section: 'B', subject: String(subject._id),
        title: 'Sneaky Homework', dueDate: '2099-01-01',
      });

    expect(res.status).toBe(403);
  });
});

describe('GET /homework/:id/submissions', () => {
  it('returns the real class roster, all not_submitted before any grading', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/homework/${homeworkId}/submissions`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data.every((s) => s.status === 'not_submitted')).toBe(true);
    expect(res.body.data.map((s) => s.studentId).sort()).toEqual([...studentIds].sort());
  });
});

describe('POST /homework/:id/submissions/:studentId/grade', () => {
  it('updates marks and status, and it persists', async () => {
    if (!dbAvailable) return;
    const gradeRes = await request(app)
      .post(`/api/v1/homework/${homeworkId}/submissions/${studentIds[0]}/grade`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ status: 'graded', marks: 7, feedback: 'Nice work.' });

    expect(gradeRes.status).toBe(200);
    expect(gradeRes.body.data.marks).toBe(7);

    const rosterRes = await request(app)
      .get(`/api/v1/homework/${homeworkId}/submissions`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    const graded = rosterRes.body.data.find((s) => s.studentId === studentIds[0]);
    expect(graded.status).toBe('graded');
    expect(graded.marks).toBe(7);
  });

  it('rejects a teacher grading another teacher\'s homework', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/homework/${homeworkId}/submissions/${studentIds[1]}/grade`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ status: 'graded', marks: 5 });

    expect(res.status).toBe(403);
  });
});
