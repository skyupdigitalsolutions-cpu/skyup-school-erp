'use strict';

// Integration tests for the Class Teacher (form-tutor) module. The key
// boundary under test: this view is WIDER than "My Classes" (full profile,
// not just roster), so a teacher who merely TEACHES A SUBJECT in the class
// (via TimetableEntry) but is NOT the class teacher must be rejected exactly
// like a teacher with no relationship to the class at all — scoping here is
// strictly "class teacher of", never the looser "teaches this class".
// Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-class-teacher';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let classTeacherToken;
let subjectTeacherToken;
let classA;
let studentInClassA;

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
        name: 'Class Teacher Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'Student', 'TimetableEntry', 'Attendance', 'BehaviourNote'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const classTeacherUser = await db.model('User').create({
    name: 'CT Teacher', email: 'ct-teacher@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const subjectTeacherUser = await db.model('User').create({
    name: 'Subject Teacher', email: 'subject-teacher@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const classTeacher = await db.model('Teacher').create({
    employeeId: 'CT-01', personal: { firstName: 'CT', lastName: 'Teacher', phone: '9000000091', email: classTeacherUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: classTeacherUser._id,
  });
  const subjectTeacher = await db.model('Teacher').create({
    employeeId: 'ST-01', personal: { firstName: 'Subject', lastName: 'Teacher', phone: '9000000092', email: subjectTeacherUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: subjectTeacherUser._id,
  });

  // classA's classTeacher is `classTeacher` — `subjectTeacher` only teaches a subject there via TimetableEntry.
  classA = await db.model('Class').create({ name: '3', academicYear: '2024-25', sections: ['A'], classTeacher: classTeacher._id });
  const subject = await db.model('Subject').create({ name: 'English', code: 'CT-ENG', grades: ['3'] });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: subjectTeacher._id, dayOfWeek: 1, period: 1,
  });

  const students = await db.model('Student').create([
    { admissionNo: 'CT-S1', rollNo: '1', personal: { firstName: 'One', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '3', section: 'A' } },
    { admissionNo: 'CT-S2', rollNo: '2', personal: { firstName: 'Two', lastName: 'Student' }, academic: { academicYear: '2024-25', class: '3', section: 'A' } },
  ]);
  studentInClassA = students[0];

  await db.model('Attendance').create([
    { academicYear: '2024-25', class: classA._id, section: 'A', student: studentInClassA._id, date: new Date('2024-06-01'), status: 'present' },
    { academicYear: '2024-25', class: classA._id, section: 'A', student: studentInClassA._id, date: new Date('2024-06-02'), status: 'absent' },
  ]);

  classTeacherToken = await login(classTeacherUser.email);
  subjectTeacherToken = await login(subjectTeacherUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /class-teacher/my-class', () => {
  it('returns the class for the real class teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/class-teacher/my-class')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isClassTeacher).toBe(true);
    expect(res.body.data.className).toBe('3');
    expect(res.body.data.students).toHaveLength(2);
  });

  it('reports isClassTeacher:false for a teacher who only teaches a subject in the class (not the class teacher)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/class-teacher/my-class')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${subjectTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.isClassTeacher).toBe(false);
  });
});

describe('GET /class-teacher/students/:studentId — the wide form-tutor profile', () => {
  it('returns the full profile (attendance, parent, medical) for the real class teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/class-teacher/students/${studentInClassA._id}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.attendance).toEqual(expect.objectContaining({ present: 1, absent: 1, total: 2, percentage: 50 }));
    expect(res.body.data.examData).toEqual({ available: false, message: expect.any(String) });
  });

  it('is REJECTED (404) for a teacher who merely teaches a subject in this class but is not its class teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/class-teacher/students/${studentInClassA._id}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${subjectTeacherToken}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /class-teacher/report-card/:studentId — honest empty until exams exist', () => {
  it('returns available:false for the class teacher (never fabricated grades)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/class-teacher/report-card/${studentInClassA._id}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.available).toBe(false);
    expect(res.body.data.message).toMatch(/exam/i);
  });

  it('is REJECTED (404) for the non-class-teacher, same as the profile endpoint', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/class-teacher/report-card/${studentInClassA._id}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${subjectTeacherToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Behaviour notes + class remarks — one log, class-teacher-scoped', () => {
  let noteId;

  it('lets the class teacher add a per-student behaviour note', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/class-teacher/behaviour-notes')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`)
      .send({ studentId: String(studentInClassA._id), type: 'praise', note: 'Helped a classmate with homework.' });

    expect(res.status).toBe(201);
    expect(res.body.data.student).toBe(String(studentInClassA._id));
    noteId = res.body.data._id;
  });

  it('lets the class teacher add a class-level remark (no studentId)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/class-teacher/behaviour-notes')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`)
      .send({ type: 'concern', note: 'Class was noisy during self-study period.' });

    expect(res.status).toBe(201);
    expect(res.body.data.student).toBeNull();
  });

  it('lists both notes for the class teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/class-teacher/behaviour-notes')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects a non-class-teacher (subject teacher) from adding a note to this class', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/class-teacher/behaviour-notes')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${subjectTeacherToken}`)
      .send({ studentId: String(studentInClassA._id), type: 'praise', note: 'Should not be allowed.' });

    expect(res.status).toBe(403);
  });

  it("returns an empty log for the non-class-teacher, never this class's notes", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/class-teacher/behaviour-notes')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${subjectTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('the note persists and is findable by studentId filter', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/class-teacher/behaviour-notes')
      .query({ studentId: String(studentInClassA._id) })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${classTeacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((n) => n._id === noteId)).toBe(true);
  });
});
