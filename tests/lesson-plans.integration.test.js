'use strict';

// Integration tests for the teacher lesson-planning module: creation is
// scoped to classes the teacher actually teaches, topic tagging resolves
// against the shared SyllabusTopic spine (reused from the subjects module,
// not duplicated here), and the topic-tree endpoint returns real seeded
// topics. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-lessonplans';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;
let classB;
let subject;
let topicUnit;
let topicChapter;

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
        name: 'Lesson Plans Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'TimetableEntry', 'SyllabusTopic', 'LessonPlan', 'SyllabusProgress'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherAUser = await db.model('User').create({
    name: 'LP Teacher A', email: 'lp-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'LP Teacher B', email: 'lp-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'LP-TA', personal: { firstName: 'LP', lastName: 'A', phone: '9000000051', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'LP-TB', personal: { firstName: 'LP', lastName: 'B', phone: '9000000052', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '7', academicYear: '2024-25', sections: ['A'] });
  classB = await db.model('Class').create({ name: '9', academicYear: '2024-25', sections: ['B'] });
  subject = await db.model('Subject').create({ name: 'Mathematics', code: 'LP-MATH', grades: ['7', '9'] });

  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1,
  });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classB._id, section: 'B', subject: subject._id, staff: teacherB._id, dayOfWeek: 2, period: 1,
  });

  topicUnit = await db.model('SyllabusTopic').create({
    academicYear: '2024-25', subject: subject._id, grade: '7', parent: null, title: 'Unit 1: Fractions', sequence: 1, plannedPeriods: 2,
  });
  topicChapter = await db.model('SyllabusTopic').create({
    academicYear: '2024-25', subject: subject._id, grade: '7', parent: topicUnit._id, title: 'Adding Fractions', sequence: 1, plannedPeriods: 3,
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

let planId;

describe('POST /lesson-plans — scoping', () => {
  it('succeeds for a class the teacher teaches, and resolves tagged topics', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/lesson-plans')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classA._id), section: 'A', subject: String(subject._id),
        date: '2099-02-10', title: 'Introducing Fractions',
        learningObjectives: 'Students can add two fractions with unlike denominators.',
        teachingMethod: 'Direct instruction + group work',
        activities: 'Whiteboard demo, then paired worksheet.',
        assessmentMethod: 'Exit ticket with 3 problems.',
        topics: [String(topicChapter._id)],
        resources: [{ title: 'Fractions slide deck', url: 'https://example.com/fractions.pdf' }],
        status: 'draft',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('Introducing Fractions');
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data.topics).toHaveLength(1);
    expect(res.body.data.topics[0].title).toBe('Adding Fractions');
    expect(res.body.data.resources).toHaveLength(1);
    planId = res.body.data._id;
  });

  it('is rejected for a class the teacher does NOT teach', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/lesson-plans')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classB._id), section: 'B', subject: String(subject._id),
        date: '2099-02-10', title: 'Sneaky Plan',
      });

    expect(res.status).toBe(403);
  });

  it('drops a topic id that does not belong to the plan subject, instead of trusting the client', async () => {
    if (!dbAvailable) return;
    const otherSubject = await db.model('Subject').create({ name: 'English', code: 'LP-ENG', grades: ['7'] });
    const foreignTopic = await db.model('SyllabusTopic').create({
      academicYear: '2024-25', subject: otherSubject._id, grade: '7', parent: null, title: 'Grammar Basics', sequence: 1, plannedPeriods: 2,
    });

    const res = await request(app)
      .post('/api/v1/lesson-plans')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        class: String(classA._id), section: 'A', subject: String(subject._id),
        date: '2099-02-11', title: 'Second Plan', topics: [String(foreignTopic._id)],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.topics).toHaveLength(0);
  });
});

describe('GET /lesson-plans/mine — scoping', () => {
  it("returns only this teacher's plans", async () => {
    if (!dbAvailable) return;
    await request(app)
      .post('/api/v1/lesson-plans')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ class: String(classB._id), section: 'B', subject: String(subject._id), date: '2099-02-12', title: "B's own plan" });

    const res = await request(app)
      .get('/api/v1/lesson-plans/mine')
      .query({ from: '2099-01-01', to: '2099-12-31' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.every((p) => p.title !== "B's own plan")).toBe(true);
  });
});

describe('PATCH /lesson-plans/:id — status flow + ownership', () => {
  it('lets the owning teacher submit it, and it persists', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .patch(`/api/v1/lesson-plans/${planId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ status: 'submitted' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('submitted');
  });

  it("rejects another teacher editing it", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .patch(`/api/v1/lesson-plans/${planId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ status: 'draft' });

    expect(res.status).toBe(403);
  });

  it('rejects a teacher trying to self-approve (validation only allows draft/submitted)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .patch(`/api/v1/lesson-plans/${planId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ status: 'approved' });

    expect(res.status).toBe(422);
  });
});

describe('GET /subjects/:id/topics — the shared syllabus spine', () => {
  it('returns the seeded topic tree for this subject/grade', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/subjects/${subject._id}/topics`)
      .query({ grade: '7', academicYear: '2024-25' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Unit 1: Fractions');
    expect(res.body.data[0].children).toHaveLength(1);
    expect(res.body.data[0].children[0].title).toBe('Adding Fractions');
  });
});

describe('Submitting a lesson plan advances tagged topic progress', () => {
  it('nudges an untouched topic to in_progress once the tagging plan is submitted', async () => {
    if (!dbAvailable) return;
    // `planId` (tagged with topicChapter) was already submitted in the PATCH block above.
    const res = await request(app)
      .get(`/api/v1/syllabus/progress/${classA._id}/A`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    const mathEntry = res.body.data.find((s) => String(s.subject.id) === String(subject._id));
    const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);
    const chapterNode = flatten(mathEntry.topicTree).find((t) => t._id === String(topicChapter._id));
    expect(chapterNode.status).toBe('in_progress');
  });

  it('never downgrades a topic a teacher already marked completed', async () => {
    if (!dbAvailable) return;
    await request(app)
      .post('/api/v1/syllabus/progress')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ academicYear: '2024-25', class: String(classA._id), section: 'A', topic: String(topicChapter._id), status: 'completed' });

    // Re-submitting the same plan (already submitted) must not regress the topic.
    await request(app)
      .patch(`/api/v1/lesson-plans/${planId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Introducing Fractions (touched again)' });

    const res = await request(app)
      .get(`/api/v1/syllabus/progress/${classA._id}/A`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    const mathEntry = res.body.data.find((s) => String(s.subject.id) === String(subject._id));
    const flatten = (nodes) => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);
    const chapterNode = flatten(mathEntry.topicTree).find((t) => t._id === String(topicChapter._id));
    expect(chapterNode.status).toBe('completed');
  });
});
