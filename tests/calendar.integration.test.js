'use strict';

// Integration tests for the teacher calendar aggregator: homework due dates
// and exam dates are pulled in and scoped to the requesting teacher, personal
// reminders are teacher-owned CRUD, and layers with no backing model
// (holidays, meetings) are never fabricated. Skips gracefully if no mongod
// is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-calendar';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;
let homeworkA;

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
        name: 'Calendar Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'TimetableEntry', 'Homework', 'Examination', 'CalendarReminder'].map(
      (name) => db.model(name).deleteMany({})
    )
  );

  const teacherAUser = await db.model('User').create({
    name: 'Cal Teacher A', email: 'cal-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'Cal Teacher B', email: 'cal-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'CAL-TA', personal: { firstName: 'Cal', lastName: 'A', phone: '9000000041', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'CAL-TB', personal: { firstName: 'Cal', lastName: 'B', phone: '9000000042', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '5', academicYear: '2024-25', sections: ['A'] });
  const classC = await db.model('Class').create({ name: '6', academicYear: '2024-25', sections: ['C'] });
  const subject = await db.model('Subject').create({ name: 'Science', code: 'CAL-SCI', grades: ['5', '6'] });

  // Teacher A teaches class 5-A; teacher B teaches class 6-C — establishes scope.
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1,
  });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classC._id, section: 'C', subject: subject._id, staff: teacherB._id, dayOfWeek: 2, period: 1,
  });

  homeworkA = await db.model('Homework').create({
    teacher: teacherA._id, class: classA._id, section: 'A', subject: subject._id, academicYear: '2024-25',
    title: 'Read Chapter 4', dueDate: new Date('2099-03-15'), status: 'assigned',
  });

  // One exam slot for class 5-A (teacher A's class) and one for class 6-C (not teacher A's) — same exam doc.
  await db.model('Examination').create({
    examId: 'CAL-EX-1', name: 'Mid Term', type: 'mid_term', academicYear: '2024-25', status: 'scheduled',
    timetable: [
      { date: new Date('2099-03-20'), subject: 'Science', class: '5', section: 'A' },
      { date: new Date('2099-03-20'), subject: 'Science', class: '6', section: 'C' },
    ],
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /calendar/me — aggregation', () => {
  it("returns the teacher's homework due dates and exam dates for their own class only", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/calendar/me')
      .query({ from: '2099-03-01', to: '2099-03-31' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    const layers = Object.fromEntries(res.body.data.layers.map((l) => [l.key, l]));

    expect(layers.homework.available).toBe(true);
    expect(layers.homework.items).toHaveLength(1);
    expect(layers.homework.items[0].title).toContain('Read Chapter 4');
    expect(layers.homework.items[0].link).toBe(`/teacher/homework/${homeworkA._id}`);

    expect(layers.exams.available).toBe(true);
    expect(layers.exams.items).toHaveLength(1);
    expect(layers.exams.items[0].title).toContain('5-A');
  });

  it('never returns items for layers with no backing model (holidays, meetings)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/calendar/me')
      .query({ from: '2099-03-01', to: '2099-03-31' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    const layers = Object.fromEntries(res.body.data.layers.map((l) => [l.key, l]));
    expect(layers.holidays).toEqual({ key: 'holidays', label: 'Holidays', available: false, items: [] });
    expect(layers.meetings).toEqual({ key: 'meetings', label: 'Meetings', available: false, items: [] });
  });

  it("does not leak another teacher's homework or a class they don't teach", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/calendar/me')
      .query({ from: '2099-03-01', to: '2099-03-31' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    const layers = Object.fromEntries(res.body.data.layers.map((l) => [l.key, l]));
    expect(layers.homework.items).toHaveLength(0);
    expect(layers.exams.items.some((i) => i.title.includes('5-A'))).toBe(false);
  });
});

describe('Personal reminders — CRUD + scoping', () => {
  let reminderId;

  it('creates a reminder scoped to the creating teacher and it appears in the aggregate', async () => {
    if (!dbAvailable) return;
    const createRes = await request(app)
      .post('/api/v1/calendar/reminders')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Parent call', date: '2099-03-18', note: 'Discuss progress' });

    expect(createRes.status).toBe(201);
    reminderId = createRes.body.data._id;

    const listRes = await request(app)
      .get('/api/v1/calendar/me')
      .query({ from: '2099-03-01', to: '2099-03-31' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    const personal = listRes.body.data.layers.find((l) => l.key === 'personal');
    expect(personal.items.some((i) => i.title === 'Parent call')).toBe(true);
  });

  it("is invisible to another teacher's aggregate", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/calendar/me')
      .query({ from: '2099-03-01', to: '2099-03-31' })
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    const personal = res.body.data.layers.find((l) => l.key === 'personal');
    expect(personal.items.some((i) => i.title === 'Parent call')).toBe(false);
  });

  it('rejects another teacher editing or deleting it', async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/calendar/reminders/${reminderId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ title: 'Hijacked' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/calendar/reminders/${reminderId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('lets the owning teacher update and delete it', async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/calendar/reminders/${reminderId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Parent call — rescheduled' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.title).toBe('Parent call — rescheduled');

    const deleteRes = await request(app)
      .delete(`/api/v1/calendar/reminders/${reminderId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(deleteRes.status).toBe(204);
  });
});
