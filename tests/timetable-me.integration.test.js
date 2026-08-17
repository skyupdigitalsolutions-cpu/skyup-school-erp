'use strict';

// Integration tests for the teacher "My Timetable" page's backend: GET
// /timetable/me scoping and the (academicYear, class, section, dayOfWeek,
// period) unique index that prevents double-booking a slot. Skips gracefully
// if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-timetable-me';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let classA;
let teacherAId;

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
        name: 'Timetable Me Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Subject', 'TimetableEntry'].map((name) => db.model(name).deleteMany({}))
  );

  const teacherAUser = await db.model('User').create({
    name: 'TT Teacher A', email: 'tt-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'TT Teacher B', email: 'tt-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  const teacherA = await db.model('Teacher').create({
    employeeId: 'TT-A', personal: { firstName: 'TT', lastName: 'A', phone: '9000000011', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  teacherAId = teacherA._id;
  const teacherB = await db.model('Teacher').create({
    employeeId: 'TT-B', personal: { firstName: 'TT', lastName: 'B', phone: '9000000012', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  classA = await db.model('Class').create({ name: '6', academicYear: '2024-25', sections: ['A'] });
  const classB = await db.model('Class').create({ name: '7', academicYear: '2024-25', sections: ['B'] });
  const subject = await db.model('Subject').create({ name: 'General Studies', code: 'TT-GS', grades: ['6', '7'] });

  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id, staff: teacherA._id, dayOfWeek: 1, period: 1, room: 'R-1',
  });
  await db.model('TimetableEntry').create({
    academicYear: '2024-25', class: classB._id, section: 'B', subject: subject._id, staff: teacherB._id, dayOfWeek: 2, period: 3, room: 'R-2',
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /timetable/me', () => {
  it("returns only the logged-in teacher's own entries", async () => {
    if (!dbAvailable) return;
    const resA = await request(app)
      .get('/api/v1/timetable/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(resA.status).toBe(200);
    const mondayA = resA.body.data.find((d) => d.dayOfWeek === 1).periods;
    expect(mondayA).toHaveLength(1);
    expect(mondayA[0].room).toBe('R-1');

    // Teacher A's grid must never contain Teacher B's Tuesday slot.
    const tuesdayA = resA.body.data.find((d) => d.dayOfWeek === 2).periods;
    expect(tuesdayA).toHaveLength(0);
  });

  it("never returns another teacher's schedule — each token sees only its own", async () => {
    if (!dbAvailable) return;
    const resB = await request(app)
      .get('/api/v1/timetable/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    expect(resB.status).toBe(200);
    const tuesdayB = resB.body.data.find((d) => d.dayOfWeek === 2).periods;
    expect(tuesdayB).toHaveLength(1);
    expect(tuesdayB[0].room).toBe('R-2');

    const mondayB = resB.body.data.find((d) => d.dayOfWeek === 1).periods;
    expect(mondayB).toHaveLength(0);
  });

  it('returns an empty grid, not an error, for a teacher with no entries', async () => {
    if (!dbAvailable) return;
    const noEntriesUser = await db.model('User').create({
      name: 'No Entries Teacher', email: 'tt-no-entries@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
    });
    await db.model('Teacher').create({
      employeeId: 'TT-NONE', personal: { firstName: 'No', lastName: 'Entries', phone: '9000000013', email: noEntriesUser.email },
      professional: { department: 'General', designation: 'TGT' }, userId: noEntriesUser._id,
    });
    const token = await login(noEntriesUser.email);

    const res = await request(app)
      .get('/api/v1/timetable/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(7);
    const totalPeriods = res.body.data.reduce((sum, d) => sum + d.periods.length, 0);
    expect(totalPeriods).toBe(0);
  });
});

describe('TimetableEntry double-booking', () => {
  it('rejects a duplicate (academicYear, class, section, dayOfWeek, period) via the unique index', async () => {
    if (!dbAvailable) return;
    const TimetableEntry = db.model('TimetableEntry');
    const subject = await db.model('Subject').findOne({ code: 'TT-GS' });

    // Same slot as the Monday period-1 entry already seeded for classA/A.
    await expect(
      TimetableEntry.create({
        academicYear: '2024-25', class: classA._id, section: 'A', subject: subject._id,
        staff: teacherAId,
        dayOfWeek: 1, period: 1, room: 'R-DUPLICATE',
      })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('rejects the same double-booking through the create endpoint with a clear 409', async () => {
    if (!dbAvailable) return;
    let principalUser = await db.model('User').findOne({ email: 'tt-principal@inttest.school' });
    if (!principalUser) {
      principalUser = await db.model('User').create({
        name: 'TT Principal', email: 'tt-principal@inttest.school', password: PASSWORD, roles: ['principal'], status: 'active',
      });
    }
    const principalToken = await login(principalUser.email);
    const subject = await db.model('Subject').findOne({ code: 'TT-GS' });

    const res = await request(app)
      .post('/api/v1/timetable')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${principalToken}`)
      .send({
        academicYear: '2024-25',
        class: String(classA._id),
        section: 'A',
        subject: String(subject._id),
        staff: String(teacherAId),
        dayOfWeek: 1,
        period: 1,
        room: 'R-CONFLICT',
      });

    expect(res.status).toBe(409);
  });
});
