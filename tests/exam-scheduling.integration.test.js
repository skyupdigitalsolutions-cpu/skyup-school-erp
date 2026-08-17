'use strict';

// Integration tests for the new Exam/ExamSchedule/ExamMark engine
// (exam-scheduling module, separate from the legacy Examination model):
// only principal/admin create exams and schedules, double-scheduling a
// subject for the same class+section is rejected (409), a subject teacher
// can enter marks only for their own class+section+subject (a teacher who
// doesn't teach it is rejected), marks upsert (re-entry corrects instead of
// duplicating), marksObtained is capped at the sitting's maxMarks, and the
// results-publish gate exists and defaults to unpublished. Skips gracefully
// if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-exam-scheduling';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let principalToken;
let teacherToken; // teaches classA-A / Mathematics
let otherTeacherToken; // teaches nothing relevant
let classA;
let mathSubject;
let examId;
let scheduleId;
let studentA1;
let studentA2;

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
        name: 'Exam Scheduling Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'Student', 'TimetableEntry', 'Exam', 'ExamSchedule', 'ExamMark'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const principalUser = await db.model('User').create({
    name: 'Exam Principal', email: 'exam-principal@esinttest.school', password: PASSWORD, roles: ['principal'], status: 'active',
  });
  const teacherUser = await db.model('User').create({
    name: 'Exam Teacher', email: 'exam-teacher@esinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const otherTeacherUser = await db.model('User').create({
    name: 'Other Teacher', email: 'exam-other-teacher@esinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacher = await db.model('Teacher').create({
    employeeId: 'ES-T1',
    personal: { firstName: 'Exam', lastName: 'Teacher', phone: '9000033001', email: teacherUser.email },
    professional: { department: 'Mathematics', designation: 'TGT' },
    userId: teacherUser._id,
  });
  await db.model('Teacher').create({
    employeeId: 'ES-T2',
    personal: { firstName: 'Other', lastName: 'Teacher', phone: '9000033002', email: otherTeacherUser.email },
    professional: { department: 'Science', designation: 'TGT' },
    userId: otherTeacherUser._id,
  });

  classA = await db.model('Class').create({ name: '9', academicYear: '2024-25', sections: ['A', 'B'] });
  mathSubject = await db.model('Subject').create({ name: 'Mathematics', code: 'ES-MATH', grades: ['9'] });
  await db.model('Subject').create({ name: 'Science', code: 'ES-SCI', grades: ['9'] });

  // The exam-teacher teaches class 9-A Mathematics — and ONLY that.
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: mathSubject._id, staff: teacher._id, dayOfWeek: 1, period: 1,
  });

  const students = await db.model('Student').create([
    {
      admissionNo: 'ES-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '9', section: 'A' },
    },
    {
      admissionNo: 'ES-A2', rollNo: '2',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '9', section: 'A' },
    },
  ]);
  [studentA1, studentA2] = students;

  principalToken = await login('exam-principal@esinttest.school');
  teacherToken = await login('exam-teacher@esinttest.school');
  otherTeacherToken = await login('exam-other-teacher@esinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('Exam creation — principal/admin only', () => {
  it('lets a principal create an exam, defaulting to draft (unpublished)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/exam-scheduling/exams')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ title: 'Term 1 Mid-Term', academicYear: '2024-25', type: 'midterm', classes: [classA._id] });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('draft');
    examId = res.body.data._id;
  });

  it('rejects a teacher trying to create an exam', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/exam-scheduling/exams')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ title: 'Hacked Exam', academicYear: '2024-25', classes: [classA._id] });
    expect(res.status).toBe(403);
  });
});

describe('Exam schedule — double-scheduling rejected', () => {
  it('lets a principal schedule Mathematics for class 9-A', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/exam-scheduling/exams/${examId}/schedule`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ class: classA._id, section: 'A', subject: mathSubject._id, date: '2025-03-10', maxMarks: 100 });

    expect(res.status).toBe(201);
    scheduleId = res.body.data._id;
  });

  it('rejects scheduling the same class+section+subject again (409)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/exam-scheduling/exams/${examId}/schedule`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ class: classA._id, section: 'A', subject: mathSubject._id, date: '2025-03-11', maxMarks: 100 });

    expect(res.status).toBe(409);
  });

  it('rejects a teacher trying to schedule a subject', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/exam-scheduling/exams/${examId}/schedule`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ class: classA._id, section: 'B', subject: mathSubject._id, date: '2025-03-12', maxMarks: 100 });
    expect(res.status).toBe(403);
  });
});

describe('Marks entry — scoped to the teacher who actually teaches the sitting', () => {
  it("lets the teacher who teaches class 9-A Mathematics fetch the marks sheet", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks-sheet`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(2);
    expect(res.body.data.students.every((s) => s.marksObtained === null)).toBe(true);
  });

  it('rejects a teacher who does NOT teach this class/subject', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks-sheet`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${otherTeacherToken}`);
    expect(res.status).toBe(403);
  });

  it('enters marks and persists them', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        records: [
          { studentId: studentA1._id, marksObtained: 88 },
          { studentId: studentA2._id, isAbsent: true },
        ],
      });
    expect(res.status).toBe(200);

    const sheet = await request(app)
      .get(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks-sheet`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`);
    const s1 = sheet.body.data.students.find((s) => String(s.studentId) === String(studentA1._id));
    const s2 = sheet.body.data.students.find((s) => String(s.studentId) === String(studentA2._id));
    expect(s1.marksObtained).toBe(88);
    expect(s2.isAbsent).toBe(true);
  });

  it('re-entering marks CORRECTS the existing row instead of duplicating it', async () => {
    if (!dbAvailable) return;
    await request(app)
      .post(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ records: [{ studentId: studentA1._id, marksObtained: 92 }] });

    const rows = await db.model('ExamMark').find({ examSchedule: scheduleId, student: studentA1._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].marksObtained).toBe(92);
  });

  it('rejects marks that exceed the sitting\'s maxMarks', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({ records: [{ studentId: studentA1._id, marksObtained: 150 }] });
    expect(res.status).toBe(400);
  });

  it('rejects a non-teaching teacher trying to enter marks', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post(`/api/v1/exam-scheduling/schedule/${scheduleId}/marks`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${otherTeacherToken}`)
      .send({ records: [{ studentId: studentA1._id, marksObtained: 10 }] });
    expect(res.status).toBe(403);
  });
});

describe('Results-publish gate', () => {
  it('defaults to draft (never published) and can be transitioned to results_published', async () => {
    if (!dbAvailable) return;
    const getRes = await request(app)
      .get(`/api/v1/exam-scheduling/exams/${examId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${principalToken}`);
    expect(getRes.body.data.status).not.toBe('results_published');

    const publishRes = await request(app)
      .patch(`/api/v1/exam-scheduling/exams/${examId}/status`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({ status: 'results_published' });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.status).toBe('results_published');
  });
});
