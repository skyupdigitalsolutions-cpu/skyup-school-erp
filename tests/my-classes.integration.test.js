'use strict';

// Integration tests for the teacher "My Classes" endpoints: scoping (a teacher
// sees only classes they teach), rejection of cross-class access, and that the
// roster never leaks fee/financial/guardian data. Skips gracefully if no
// mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-my-classes';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;
let classB;
let studentInA;

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
        name: 'My Classes Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Student', 'Subject', 'TimetableEntry', 'Attendance'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherAUser = await db.model('User').create({
    name: 'MyClasses Teacher A', email: 'mc-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'MyClasses Teacher B', email: 'mc-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'MC-TA', personal: { firstName: 'MC', lastName: 'A', phone: '9000000021', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'MC-TB', personal: { firstName: 'MC', lastName: 'B', phone: '9000000022', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '4', academicYear: '2024-25', sections: ['A'], classTeacher: teacherA._id });
  classB = await db.model('Class').create({ name: '5', academicYear: '2024-25', sections: ['B'], classTeacher: teacherB._id });

  const subject = await db.model('Subject').create({ name: 'General Studies', code: 'MC-GS', grades: ['4', '5'] });

  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1,
  });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classB._id, section: 'B', subject: subject._id, staff: teacherB._id, dayOfWeek: 1, period: 1,
  });

  studentInA = await db.model('Student').create({
    admissionNo: 'MC-S1', rollNo: '1',
    personal: { firstName: 'Roster', lastName: 'StudentA' },
    academic: { academicYear: '2024-25', class: '4', section: 'A' },
    feeStatus: { totalFee: 50000, paidAmount: 10000, dueAmount: 40000, status: 'due' },
    parent: { father: { name: 'Father Name', phone: '9999999999', occupation: 'Engineer' } },
  });
  await db.model('Student').create({
    admissionNo: 'MC-S2', rollNo: '1',
    personal: { firstName: 'Roster', lastName: 'StudentB' },
    academic: { academicYear: '2024-25', class: '5', section: 'B' },
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /classes/mine', () => {
  it('returns only the classes this teacher teaches', async () => {
    if (!dbAvailable) return;
    const resA = await request(app)
      .get('/api/v1/classes/mine')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data).toHaveLength(1);
    expect(resA.body.data[0].classId).toBe(String(classA._id));
    expect(resA.body.data[0].studentCount).toBe(1);
    expect(resA.body.data[0].isClassTeacher).toBe(true);

    const resB = await request(app)
      .get('/api/v1/classes/mine')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(resB.body.data).toHaveLength(1);
    expect(resB.body.data[0].classId).toBe(String(classB._id));
  });
});

describe('GET /classes/:classId/students scoping', () => {
  it('returns the real roster for a class the teacher teaches', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/classes/${classA._id}/students`)
      .query({ section: 'A' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(1);
    expect(res.body.data.students[0].admissionNo).toBe('MC-S1');
  });

  it('rejects (empty, never leaks) a class the teacher does NOT teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/classes/${classB._id}/students`)
      .query({ section: 'B' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students).toEqual([]);
  });

  it('never includes fee, guardian, or financial fields in the roster', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/classes/${classA._id}/students`)
      .query({ section: 'A' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/feeStatus|parent|dueAmount|father|occupation|medical/i);

    const student = res.body.data.students[0];
    expect(Object.keys(student).sort()).toEqual(['admissionNo', 'name', 'photo', 'rollNo', 'studentId'].sort());
  });

  it('rejects a student-profile lookup for a class the teacher does not teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/classes/${classA._id}/students/${studentInA._id}`)
      .query({ section: 'A' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    expect(res.status).toBe(403);
  });
});
