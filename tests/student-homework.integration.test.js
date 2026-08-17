'use strict';

// Integration tests for the student/parent read-only Diary/Homework view:
// the endpoint returns only the logged-in student's own CLASS homework
// (never a draft, never another class's), and each item's `mySubmission`
// belongs only to that student — a classmate's graded marks/feedback must
// never leak into another student's view of the same homework. Skips
// gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-homework';
const PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

let app;
let db;
let dbAvailable = true;
let parentTokenA1; // class 7-A, student with submissions
let parentTokenA2; // class 7-A, student with NO submissions (same homework)
let parentTokenC; // class 8-C, no homework at all

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function getHomework(token, query) {
  return request(app)
    .get('/api/v1/student-homework/me')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${token}`)
    .query(query || {});
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
        name: 'Student Homework Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'Student', 'StudentAccount', 'Homework', 'Submission'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherUser = await db.model('User').create({
    name: 'Homework Teacher', email: 'hw-teacher@shinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacher = await db.model('Teacher').create({
    employeeId: 'SHT-T1',
    personal: { firstName: 'Homework', lastName: 'Teacher', phone: '9000022000', email: teacherUser.email },
    professional: { department: 'General', designation: 'TGT' },
    userId: teacherUser._id,
  });
  const subject = await db.model('Subject').create({ name: 'English', code: 'SHT-ENG', grades: ['7'] });

  const classA = await db.model('Class').create({ name: '7', academicYear: '2024-25', sections: ['A'] });
  await db.model('Class').create({ name: '8', academicYear: '2024-25', sections: ['C'] });

  const students = await db.model('Student').create([
    {
      admissionNo: 'SHT-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '7', section: 'A' },
    },
    {
      admissionNo: 'SHT-A2', rollNo: '2',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '7', section: 'A' },
    },
    {
      admissionNo: 'SHT-C1', rollNo: '1',
      personal: { firstName: 'Cara', lastName: 'Three' },
      academic: { academicYear: '2024-25', class: '8', section: 'C' },
    },
  ]);
  const [studentA1, studentA2, studentC1] = students;

  await db.model('StudentAccount').create({
    student: studentA1._id, viewerType: 'parent', email: 'parent-a1@shinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA2._id, viewerType: 'parent', email: 'parent-a2@shinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentC1._id, viewerType: 'parent', email: 'parent-c1@shinttest.school', password: PASSWORD, isActive: true,
  });

  const now = Date.now();
  const common = { teacher: teacher._id, class: classA._id, section: 'A', subject: subject._id, academicYear: '2024-25', status: 'assigned' };

  const hwPending = await db.model('Homework').create({
    ...common, title: 'Pending — Reading Log', dueDate: new Date(now + 5 * DAY_MS),
  });
  const hwOverdue = await db.model('Homework').create({
    ...common, title: 'Overdue — Grammar Sheet', dueDate: new Date(now - 3 * DAY_MS),
  });
  const hwSubmitted = await db.model('Homework').create({
    ...common, title: 'Submitted — Essay Draft', dueDate: new Date(now + 1 * DAY_MS),
  });
  const hwGraded = await db.model('Homework').create({
    ...common, title: 'Graded — Vocabulary Quiz', dueDate: new Date(now - 1 * DAY_MS), maxMarks: 10,
  });
  await db.model('Homework').create({
    ...common, title: 'A Draft Not Yet Assigned', status: 'draft', dueDate: new Date(now + 10 * DAY_MS),
  });

  // Only studentA1 has submissions — studentA2 gets none of these, even
  // though they're in the same class and see the same homework list.
  await db.model('Submission').create({
    homework: hwSubmitted._id, student: studentA1._id, status: 'submitted', submittedAt: new Date(now - 1000),
  });
  await db.model('Submission').create({
    homework: hwGraded._id, student: studentA1._id, status: 'graded', marks: 8, feedback: 'Well done.', gradedAt: new Date(),
  });

  parentTokenA1 = await loginStudentPortal('parent-a1@shinttest.school');
  parentTokenA2 = await loginStudentPortal('parent-a2@shinttest.school');
  parentTokenC = await loginStudentPortal('parent-c1@shinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-homework/me', () => {
  it("returns only the logged-in student's class homework, never a draft", async () => {
    if (!dbAvailable) return;
    const res = await getHomework(parentTokenA1);
    expect(res.status).toBe(200);
    const titles = res.body.data.map((h) => h.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Pending — Reading Log', 'Overdue — Grammar Sheet', 'Submitted — Essay Draft', 'Graded — Vocabulary Quiz',
    ]));
    expect(titles).not.toContain('A Draft Not Yet Assigned');
    expect(res.body.data).toHaveLength(4);
  });

  it("shows this student's own submission/grade for a graded item", async () => {
    if (!dbAvailable) return;
    const res = await getHomework(parentTokenA1);
    const graded = res.body.data.find((h) => h.title === 'Graded — Vocabulary Quiz');
    expect(graded.mySubmission.status).toBe('graded');
    expect(graded.mySubmission.marks).toBe(8);
    expect(graded.mySubmission.feedback).toBe('Well done.');
    expect(graded.isOverdue).toBe(false); // already graded, so not "overdue"
  });

  it('flags an unsubmitted, past-due item as overdue', async () => {
    if (!dbAvailable) return;
    const res = await getHomework(parentTokenA1);
    const overdue = res.body.data.find((h) => h.title === 'Overdue — Grammar Sheet');
    expect(overdue.mySubmission.status).toBe('not_submitted');
    expect(overdue.isOverdue).toBe(true);
  });

  it("never leaks another student's submission — a classmate with no submissions sees the same homework as not_submitted", async () => {
    if (!dbAvailable) return;
    const res = await getHomework(parentTokenA2);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(4);

    const graded = res.body.data.find((h) => h.title === 'Graded — Vocabulary Quiz');
    expect(graded.mySubmission.status).toBe('not_submitted');
    expect(graded.mySubmission.marks).toBeNull();
    expect(graded.mySubmission.feedback).toBeNull();

    const submitted = res.body.data.find((h) => h.title === 'Submitted — Essay Draft');
    expect(submitted.mySubmission.status).toBe('not_submitted');
  });

  it("returns an empty list (not an error) for a student in a class with no homework", async () => {
    if (!dbAvailable) return;
    const res = await getHomework(parentTokenC);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('filters by status: pending, overdue, submitted, graded', async () => {
    if (!dbAvailable) return;
    const pending = await getHomework(parentTokenA1, { status: 'pending' });
    expect(pending.body.data.map((h) => h.title)).toEqual(['Pending — Reading Log']);

    const overdue = await getHomework(parentTokenA1, { status: 'overdue' });
    expect(overdue.body.data.map((h) => h.title)).toEqual(['Overdue — Grammar Sheet']);

    const submitted = await getHomework(parentTokenA1, { status: 'submitted' });
    expect(submitted.body.data.map((h) => h.title)).toEqual(['Submitted — Essay Draft']);

    const graded = await getHomework(parentTokenA1, { status: 'graded' });
    expect(graded.body.data.map((h) => h.title)).toEqual(['Graded — Vocabulary Quiz']);
  });
});
