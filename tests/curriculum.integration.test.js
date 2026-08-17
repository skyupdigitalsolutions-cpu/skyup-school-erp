'use strict';

// Integration tests for the timetable/syllabus scoping rules. These hit a real
// Mongo instance through the full Express app (supertest), and skip gracefully
// if no mongod is reachable — same spirit as the rest of this test run: we
// want CI-less local runs to still pass when Mongo simply isn't installed.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-curriculum';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherToken;
let ownedClass;
let foreignClass;
let mathTopic;

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
        name: 'Integration Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  // Clean slate for this tenant on every run.
  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'SyllabusTopic', 'TimetableEntry', 'SyllabusProgress'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherUser = await db.model('User').create({
    name: 'Scope Teacher',
    email: 'scope-teacher@inttest.school',
    password: PASSWORD,
    roles: ['teacher'],
    status: 'active',
  });

  const teacher = await db.model('Teacher').create({
    employeeId: 'INT-T1',
    personal: { firstName: 'Scope', lastName: 'Teacher', phone: '9999911111', email: teacherUser.email },
    professional: { department: 'Mathematics', designation: 'TGT' },
    userId: teacherUser._id,
  });

  ownedClass = await db.model('Class').create({ name: '8', academicYear: '2024-25', sections: ['A'] });
  foreignClass = await db.model('Class').create({ name: '9', academicYear: '2024-25', sections: ['B'] });

  const subject = await db.model('Subject').create({ name: 'Mathematics', code: 'MATHX', grades: ['8'] });

  mathTopic = await db.model('SyllabusTopic').create({
    academicYear: '2024-25',
    subject: subject._id,
    grade: '8',
    title: 'Topic 1',
    plannedPeriods: 3,
  });

  // The teacher only has a TimetableEntry for `ownedClass` — never `foreignClass`.
  await db.model('TimetableEntry').create({
    academicYear: '2024-25',
    class: ownedClass._id,
    section: 'A',
    subject: subject._id,
    staff: teacher._id,
    dayOfWeek: 1,
    period: 1,
  });

  teacherToken = await login(teacherUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('timetable/syllabus scoping', () => {
  it('lets a teacher see the timetable for a class they teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/timetable/class/${ownedClass._id}/A`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    const mondayPeriods = res.body.data.find((d) => d.dayOfWeek === 1).periods;
    expect(mondayPeriods).toHaveLength(1);
  });

  it('returns an empty grid (not an error) for a class the teacher does not teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/timetable/class/${foreignClass._id}/B`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    const totalPeriods = res.body.data.reduce((sum, d) => sum + d.periods.length, 0);
    expect(totalPeriods).toBe(0);
  });

  it('returns empty syllabus progress for a class the teacher does not teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/syllabus/progress/${foreignClass._id}/B`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('lets a teacher mark syllabus progress for a class they teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/syllabus/progress')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicYear: '2024-25',
        class: String(ownedClass._id),
        section: 'A',
        topic: String(mathTopic._id),
        status: 'completed',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('rejects marking syllabus progress on a class the teacher does not teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/syllabus/progress')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        academicYear: '2024-25',
        class: String(foreignClass._id),
        section: 'B',
        topic: String(mathTopic._id),
        status: 'completed',
      });

    expect(res.status).toBe(403);
  });
});
