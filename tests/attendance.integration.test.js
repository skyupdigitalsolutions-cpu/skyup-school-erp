'use strict';

// Integration tests for the attendance register: class-teacher scoping and
// upsert-not-duplicate. Hits a real Mongo instance through the full Express
// app (supertest); skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-attendance';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherToken;
let ownedClass;
let foreignClass;
let rosterStudentIds;

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

  app = createApp(); // requires ./routes -> registers every module's models

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOneAndUpdate(
    { slug: TENANT_SLUG },
    {
      $set: {
        slug: TENANT_SLUG,
        name: 'Attendance Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Student', 'Attendance'].map((name) => db.model(name).deleteMany({}))
  );

  const teacherUser = await db.model('User').create({
    name: 'Register Teacher',
    email: 'register-teacher@inttest.school',
    password: PASSWORD,
    roles: ['teacher'],
    status: 'active',
  });

  const teacher = await db.model('Teacher').create({
    employeeId: 'ATT-T1',
    personal: { firstName: 'Register', lastName: 'Teacher', phone: '9999922222', email: teacherUser.email },
    professional: { department: 'General', designation: 'TGT' },
    userId: teacherUser._id,
  });

  // Owned: this teacher is set as classTeacher. Foreign: no classTeacher link.
  ownedClass = await db
    .model('Class')
    .create({ name: '5', academicYear: '2024-25', sections: ['A'], classTeacher: teacher._id });
  foreignClass = await db.model('Class').create({ name: '6', academicYear: '2024-25', sections: ['B'] });

  const students = await db.model('Student').create([
    { admissionNo: 'ATT-S1', rollNo: '1', personal: { firstName: 'One', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '5', section: 'A' } },
    { admissionNo: 'ATT-S2', rollNo: '2', personal: { firstName: 'Two', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '5', section: 'A' } },
  ]);
  rosterStudentIds = students.map((s) => String(s._id));

  teacherToken = await login(teacherUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('attendance register', () => {
  it('lets a class teacher mark attendance for their own class', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/attendance')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: String(ownedClass._id),
        section: 'A',
        date: '2025-02-01',
        records: [
          { studentId: rosterStudentIds[0], status: 'present' },
          { studentId: rosterStudentIds[1], status: 'absent' },
        ],
      });

    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ present: 1, absent: 1, late: 0, excused: 0, holiday: 0, total: 2 });

    // Reflected back on the roster read.
    const roster = await request(app)
      .get(`/api/v1/attendance/class/${ownedClass._id}/A?date=2025-02-01`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);
    const byId = Object.fromEntries(roster.body.data.students.map((s) => [String(s.studentId), s.status]));
    expect(byId[rosterStudentIds[0]]).toBe('present');
    expect(byId[rosterStudentIds[1]]).toBe('absent');
  });

  it('rejects a teacher marking attendance for a class they do not teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/attendance')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: String(foreignClass._id),
        section: 'B',
        date: '2025-02-01',
        records: [{ studentId: rosterStudentIds[0], status: 'present' }],
      });

    expect(res.status).toBe(403);
  });

  it('returns an empty roster (not an error) for a class the teacher does not teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/attendance/class/${foreignClass._id}/B?date=2025-02-01`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students).toEqual([]);
  });

  it('upserts on re-post of the same date instead of duplicating', async () => {
    if (!dbAvailable) return;
    // First post already happened in test 1 (present/absent). Re-post flipped statuses.
    const res = await request(app)
      .post('/api/v1/attendance')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: String(ownedClass._id),
        section: 'A',
        date: '2025-02-01',
        records: [
          { studentId: rosterStudentIds[0], status: 'late', remarks: 'traffic' },
          { studentId: rosterStudentIds[1], status: 'present' },
        ],
      });
    expect(res.status).toBe(200);

    const count = await db.model('Attendance').countDocuments({
      class: ownedClass._id,
      section: 'A',
      date: new Date('2025-02-01T00:00:00.000Z'),
    });
    expect(count).toBe(2); // still 2 rows (one per student), not 4

    const roster = await request(app)
      .get(`/api/v1/attendance/class/${ownedClass._id}/A?date=2025-02-01`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);
    const byId = Object.fromEntries(roster.body.data.students.map((s) => [String(s.studentId), s.status]));
    expect(byId[rosterStudentIds[0]]).toBe('late');
    expect(byId[rosterStudentIds[1]]).toBe('present');
  });

  it('rejects the whole request if any studentId is outside the class roster', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/attendance')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        classId: String(ownedClass._id),
        section: 'A',
        date: '2025-02-02',
        records: [
          { studentId: rosterStudentIds[0], status: 'present' },
          { studentId: '000000000000000000000000', status: 'present' },
        ],
      });

    expect(res.status).toBe(400);
  });
});
