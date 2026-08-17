'use strict';

// Integration tests for the student/parent read-only Timetable view: the
// endpoint returns only the logged-in student's OWN class+section schedule
// (reusing TimetableRepository.forClassSection + TimetableService.groupByDay
// verbatim), a class with no timetable set returns an empty grid rather than
// erroring, and a student in one class can never see another class's
// schedule. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-timetable';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let parentTokenA; // class 5-A, has timetable entries
let parentTokenB; // class 6-B, no timetable entries at all

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function getTimetable(token) {
  return request(app)
    .get('/api/v1/student-timetable/me')
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
        name: 'Student Timetable Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'Student', 'StudentAccount', 'TimetableEntry'].map((name) =>
      db.model(name).deleteMany({})
    )
  );

  const teacherUser = await db.model('User').create({
    name: 'Timetable Teacher', email: 'tt-teacher@stinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacher = await db.model('Teacher').create({
    employeeId: 'STT-T1',
    personal: { firstName: 'Timetable', lastName: 'Teacher', phone: '9000011000', email: teacherUser.email },
    professional: { department: 'General', designation: 'TGT' },
    userId: teacherUser._id,
  });

  const subject = await db.model('Subject').create({ name: 'Mathematics', code: 'STT-MATH', grades: ['5'] });

  const classA = await db.model('Class').create({ name: '5', academicYear: '2024-25', sections: ['A'] });
  const classB = await db.model('Class').create({ name: '6', academicYear: '2024-25', sections: ['B'] });

  const students = await db.model('Student').create([
    {
      admissionNo: 'STT-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    },
    {
      admissionNo: 'STT-B1', rollNo: '1',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '6', section: 'B' },
    },
  ]);
  const [studentA, studentB] = students;

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@stinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@stinttest.school', password: PASSWORD, isActive: true,
  });

  // Only class 5-A gets a timetable; class 6-B has none at all.
  await db.model('TimetableEntry').create([
    { academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacher._id, dayOfWeek: 1, period: 1, room: 'R-1' },
    { academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacher._id, dayOfWeek: 1, period: 2, room: 'R-1' },
    { academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacher._id, dayOfWeek: 3, period: 1, room: 'R-2' },
  ]);

  parentTokenA = await loginStudentPortal('parent-a@stinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@stinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-timetable/me', () => {
  it("returns only the logged-in student's own class+section schedule", async () => {
    if (!dbAvailable) return;
    const res = await getTimetable(parentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.className).toBe('5');
    expect(res.body.data.section).toBe('A');
    expect(res.body.data.days).toHaveLength(7);

    const monday = res.body.data.days.find((d) => d.dayOfWeek === 1);
    expect(monday.periods).toHaveLength(2);
    expect(monday.periods[0].period).toBe(1);
    expect(monday.periods[0].subject.name).toBe('Mathematics');
    expect(monday.periods[0].room).toBe('R-1');
    expect(monday.periods[0].staff.personal.firstName).toBe('Timetable');

    const wednesday = res.body.data.days.find((d) => d.dayOfWeek === 3);
    expect(wednesday.periods).toHaveLength(1);
    expect(wednesday.periods[0].room).toBe('R-2');

    const tuesday = res.body.data.days.find((d) => d.dayOfWeek === 2);
    expect(tuesday.periods).toHaveLength(0);
  });

  it('returns an empty grid (not an error) for a class with no timetable set', async () => {
    if (!dbAvailable) return;
    const res = await getTimetable(parentTokenB);
    expect(res.status).toBe(200);
    expect(res.body.data.className).toBe('6');
    expect(res.body.data.section).toBe('B');
    expect(res.body.data.days).toHaveLength(7);
    expect(res.body.data.days.every((d) => d.periods.length === 0)).toBe(true);
  });

  it("never bleeds class 5-A's entries into class 6-B's response", async () => {
    if (!dbAvailable) return;
    const res = await getTimetable(parentTokenB);
    const totalPeriods = res.body.data.days.reduce((sum, d) => sum + d.periods.length, 0);
    expect(totalPeriods).toBe(0);
  });
});
