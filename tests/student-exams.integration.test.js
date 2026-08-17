'use strict';

// Integration tests for the student/parent read-only Exams view over the
// NEW exam-scheduling engine (Exam/ExamSchedule/ExamMark) — never the legacy
// Examination model. Timetable/admit-card are visible any time an exam
// applies to the student's class; results are gated strictly on
// `exam.status === 'results_published'` — pre-publish, no marks are ever
// returned, even if ExamMark rows already exist. Everything is scoped to the
// logged-in student's own class+section and own marks only. Skips
// gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-exams';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let parentTokenA1; // class 7-A, has a Mathematics mark
let parentTokenA2; // class 7-A, same exam, NO marks entered
let parentTokenB; // class 8-B, exam does not apply here
let examId;

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function get(path, token) {
  return request(app)
    .get(`/api/v1/student-exams${path}`)
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
        name: 'Student Exams Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['Class', 'Subject', 'Student', 'StudentAccount', 'Exam', 'ExamSchedule', 'ExamMark'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const classA = await db.model('Class').create({ name: '7', academicYear: '2024-25', sections: ['A'] });
  await db.model('Class').create({ name: '8', academicYear: '2024-25', sections: ['B'] });

  const mathSubject = await db.model('Subject').create({ name: 'Mathematics', code: 'SE-MATH', grades: ['7'] });
  const sciSubject = await db.model('Subject').create({ name: 'Science', code: 'SE-SCI', grades: ['7'] });

  const students = await db.model('Student').create([
    {
      admissionNo: 'SE-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '7', section: 'A' },
    },
    {
      admissionNo: 'SE-A2', rollNo: '2',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '7', section: 'A' },
    },
    {
      admissionNo: 'SE-B1', rollNo: '1',
      personal: { firstName: 'Cara', lastName: 'Three' },
      academic: { academicYear: '2024-25', class: '8', section: 'B' },
    },
  ]);
  const [studentA1, studentA2, studentB1] = students;

  await db.model('StudentAccount').create({
    student: studentA1._id, viewerType: 'parent', email: 'parent-a1@seinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA2._id, viewerType: 'parent', email: 'parent-a2@seinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB1._id, viewerType: 'parent', email: 'parent-b1@seinttest.school', password: PASSWORD, isActive: true,
  });

  const exam = await db.model('Exam').create({
    title: 'Term 1 Mid-Term', academicYear: '2024-25', type: 'midterm', classes: [classA._id], status: 'scheduled',
  });
  examId = String(exam._id);

  const mathSchedule = await db.model('ExamSchedule').create({
    exam: exam._id, class: classA._id, section: 'A', subject: mathSubject._id,
    date: new Date('2025-03-10'), startTime: '09:00', endTime: '11:00', room: 'R-1', maxMarks: 100,
  });
  await db.model('ExamSchedule').create({
    exam: exam._id, class: classA._id, section: 'A', subject: sciSubject._id,
    date: new Date('2025-03-12'), startTime: '09:00', endTime: '11:00', room: 'R-2', maxMarks: 100,
  });

  // Only studentA1 has a mark — studentA2 has none, even for the same sitting.
  await db.model('ExamMark').create({
    examSchedule: mathSchedule._id, student: studentA1._id, marksObtained: 82,
  });

  parentTokenA1 = await loginStudentPortal('parent-a1@seinttest.school');
  parentTokenA2 = await loginStudentPortal('parent-a2@seinttest.school');
  parentTokenB = await loginStudentPortal('parent-b1@seinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-exams/me', () => {
  it("lists the exam for a student whose class it applies to", async () => {
    if (!dbAvailable) return;
    const res = await get('/me', parentTokenA1);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('Term 1 Mid-Term');
  });

  it("returns an empty list for a student whose class the exam does NOT apply to", async () => {
    if (!dbAvailable) return;
    const res = await get('/me', parentTokenB);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});

describe('GET /student-exams/:examId/timetable', () => {
  it('returns the sittings for the student\'s own class+section', async () => {
    if (!dbAvailable) return;
    const res = await get(`/${examId}/timetable`, parentTokenA1);
    expect(res.status).toBe(200);
    expect(res.body.data.sittings).toHaveLength(2);
    const math = res.body.data.sittings.find((s) => s.subject.name === 'Mathematics');
    expect(math.room).toBe('R-1');
    expect(math.maxMarks).toBe(100);
  });

  it("rejects a student whose class the exam doesn't apply to (404, no leak)", async () => {
    if (!dbAvailable) return;
    const res = await get(`/${examId}/timetable`, parentTokenB);
    expect(res.status).toBe(404);
  });
});

describe('GET /student-exams/:examId/admit-card', () => {
  it('includes the student\'s own identity and the sitting list', async () => {
    if (!dbAvailable) return;
    const res = await get(`/${examId}/admit-card`, parentTokenA1);
    expect(res.status).toBe(200);
    expect(res.body.data.student.admissionNo).toBe('SE-A1');
    expect(res.body.data.student.className).toBe('7');
    expect(res.body.data.sittings).toHaveLength(2);
  });
});

describe('GET /student-exams/:examId/results — the publish gate', () => {
  it('returns published:false and NO marks/subjects before the exam is published, even though a mark already exists', async () => {
    if (!dbAvailable) return;
    const res = await get(`/${examId}/results`, parentTokenA1);
    expect(res.status).toBe(200);
    expect(res.body.data.published).toBe(false);
    expect(res.body.data.subjects).toEqual([]);
    expect(res.body.data.summary).toBeNull();
    // Anchored to the actual field name, not a bare "82" — a random Mongo
    // ObjectId elsewhere in the payload can coincidentally contain "82" as a
    // hex substring (confirmed: this flaked on real runs), so a bare-digit
    // regex is not a safe way to prove the mark is absent. subjects:[] and
    // summary:null above already fully prove it structurally; this is the
    // named-field-anchored version of the same check.
    expect(JSON.stringify(res.body.data)).not.toMatch(/"marksObtained"\s*:\s*82\b/);
  });

  it('returns real marks/percentage once the exam is published', async () => {
    if (!dbAvailable) return;
    await db.model('Exam').findByIdAndUpdate(examId, { status: 'results_published' });

    const res = await get(`/${examId}/results`, parentTokenA1);
    expect(res.status).toBe(200);
    expect(res.body.data.published).toBe(true);
    const math = res.body.data.subjects.find((s) => s.subject.name === 'Mathematics');
    expect(math.marksObtained).toBe(82);
    const science = res.body.data.subjects.find((s) => s.subject.name === 'Science');
    expect(science.marksObtained).toBeNull(); // never entered — real, not fabricated

    // summary counts only the one scored subject (82/100), science excluded (no mark yet).
    expect(res.body.data.summary.totalObtained).toBe(82);
    expect(res.body.data.summary.totalMax).toBe(100);
    expect(res.body.data.summary.percentage).toBe(82);
  });

  it("never leaks student A1's marks into student A2's own (published) results", async () => {
    if (!dbAvailable) return;
    const res = await get(`/${examId}/results`, parentTokenA2);
    expect(res.status).toBe(200);
    expect(res.body.data.published).toBe(true);
    const math = res.body.data.subjects.find((s) => s.subject.name === 'Mathematics');
    expect(math.marksObtained).toBeNull();
    expect(res.body.data.summary.totalObtained).toBe(0);
  });
});
