'use strict';

// Integration tests for the teacher study-material library: creation is
// scoped to classes the teacher actually teaches, listMine only returns the
// owning teacher's materials, and another teacher can't edit/delete someone
// else's upload. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-studymaterial';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;
let classB;
let subject;
let topic;

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
        name: 'Study Material Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'TimetableEntry', 'SyllabusTopic', 'StudyMaterial'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherAUser = await db.model('User').create({
    name: 'SM Teacher A', email: 'sm-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'SM Teacher B', email: 'sm-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'SM-TA', personal: { firstName: 'SM', lastName: 'A', phone: '9000000061', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'SM-TB', personal: { firstName: 'SM', lastName: 'B', phone: '9000000062', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '4', academicYear: '2024-25', sections: ['A'] });
  classB = await db.model('Class').create({ name: '5', academicYear: '2024-25', sections: ['B'] });
  subject = await db.model('Subject').create({ name: 'Science', code: 'SM-SCI', grades: ['4', '5'] });

  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1,
  });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classB._id, section: 'B', subject: subject._id, staff: teacherB._id, dayOfWeek: 2, period: 1,
  });

  topic = await db.model('SyllabusTopic').create({
    academicYear: '2024-25', subject: subject._id, grade: '4', parent: null, title: 'Plants', sequence: 1, plannedPeriods: 2,
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

let materialId;

describe('POST /study-material — scoping', () => {
  it('succeeds for a class the teacher teaches, and tags a real topic', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/study-material')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classA._id), section: 'A', subject: String(subject._id), topic: String(topic._id),
        title: 'Plants Notes', type: 'notes', description: 'Parts of a plant, summarized.',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Plants Notes');
    expect(res.body.data.topic.title).toBe('Plants');
    materialId = res.body.data._id;
  });

  it('is rejected for a class the teacher does NOT teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/study-material')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classB._id), section: 'B', subject: String(subject._id),
        title: 'Sneaky Material', type: 'pdf', url: 'https://example.com/sneaky.pdf',
      });

    expect(res.status).toBe(403);
  });

  it('rejects a payload with neither a link nor a description', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/study-material')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ class: String(classA._id), section: 'A', subject: String(subject._id), title: 'Empty Material', type: 'notes' });

    expect(res.status).toBe(422);
  });
});

describe('GET /study-material/mine — scoping', () => {
  it("returns only this teacher's materials, filterable by type", async () => {
    if (!dbAvailable) return;
    await request(app)
      .post('/api/v1/study-material')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ class: String(classB._id), section: 'B', subject: String(subject._id), title: "B's own material", type: 'video', url: 'https://example.com/vid.mp4' });

    const res = await request(app)
      .get('/api/v1/study-material/mine')
      .query({ type: 'notes' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.every((m) => m.title !== "B's own material")).toBe(true);
    expect(res.body.data.every((m) => m.type === 'notes')).toBe(true);
  });
});

describe('PATCH/DELETE /study-material/:id — ownership', () => {
  it("rejects another teacher editing or deleting it", async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/study-material/${materialId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ title: 'Hijacked' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/study-material/${materialId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('lets the owning teacher update and delete it', async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/study-material/${materialId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Plants Notes (revised)' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.title).toBe('Plants Notes (revised)');

    const deleteRes = await request(app)
      .delete(`/api/v1/study-material/${materialId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(deleteRes.status).toBe(204);
  });
});
