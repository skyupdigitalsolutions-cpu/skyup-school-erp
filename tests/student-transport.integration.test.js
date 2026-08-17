'use strict';

// Integration tests for the student-portal Transport view: a read-only
// window over the existing embedded `Student.transport` object — no
// transport-management engine exists in this codebase, so nothing is
// invented beyond `{ enrolled, routeNo, stopName, vehicleNo }`. Visible to
// both parent and student viewers, scoped to the logged-in student's own
// Student document only. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-transport';
const PASSWORD = 'Password123!';

let app;
let dbAvailable = true;
let parentTokenA; // enrolled in transport
let studentTokenA; // same student, viewerType 'student'
let parentTokenB; // NOT enrolled

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function getTransport(token) {
  return request(app)
    .get('/api/v1/student-transport/me')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${token}`);
}

function getLiveTrip(token) {
  return request(app)
    .get('/api/v1/student-transport/live-trip')
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
        name: 'Student Transport Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(['Student', 'StudentAccount', 'BusTrip'].map((name) => db.model(name).deleteMany({})));

  const [studentA, studentB] = await db.model('Student').create([
    {
      admissionNo: 'ST-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
      transport: { enrolled: true, routeNo: 'R-7', stopName: 'Lake View Colony', vehicleNo: 'MH-12-AB-3456' },
    },
    {
      admissionNo: 'ST-B1', rollNo: '1',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '5', section: 'B' },
      // transport left at schema default: enrolled: false
    },
  ]);

  // An in-progress trip on route R-7 (studentA's route) with a real last-known point.
  await db.model('BusTrip').create({
    route: 'R-7', date: new Date(), direction: 'drop', departedAt: new Date(), status: 'in_progress',
    loggedBy: new mongoose.Types.ObjectId(), // no real Caretaker doc needed for this read-only check
    lastLocation: { lat: 19.076, lng: 72.877, timestamp: new Date() },
    trail: [{ lat: 19.070, lng: 72.870, timestamp: new Date() }, { lat: 19.076, lng: 72.877, timestamp: new Date() }],
  });
  // A COMPLETED trip on a different route — must never surface as "active".
  await db.model('BusTrip').create({
    route: 'R-99', date: new Date(), direction: 'drop', departedAt: new Date(), arrivedAt: new Date(), status: 'completed',
    loggedBy: new mongoose.Types.ObjectId(),
  });

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@stinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@stinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@stinttest.school', password: PASSWORD, isActive: true,
  });

  parentTokenA = await loginStudentPortal('parent-a@stinttest.school');
  studentTokenA = await loginStudentPortal('student-a@stinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@stinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-transport/me — enrolled student', () => {
  it('returns the real route/stop/vehicle fields, nothing invented', async () => {
    if (!dbAvailable) return;
    const res = await getTransport(parentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      enrolled: true, routeNo: 'R-7', stopName: 'Lake View Colony', vehicleNo: 'MH-12-AB-3456',
    });
  });

  it('is visible to the student viewer too, not just parent', async () => {
    if (!dbAvailable) return;
    const res = await getTransport(studentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.enrolled).toBe(true);
    expect(res.body.data.routeNo).toBe('R-7');
  });
});

describe('GET /student-transport/me — not enrolled', () => {
  it('returns a clean { enrolled: false } state, not a 500 or empty error', async () => {
    if (!dbAvailable) return;
    const res = await getTransport(parentTokenB);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ enrolled: false, routeNo: null, stopName: null, vehicleNo: null });
  });
});

describe('GET /student-transport/me — scoped to the logged-in student only', () => {
  it("never returns another student's transport assignment", async () => {
    if (!dbAvailable) return;
    const resA = await getTransport(parentTokenA);
    const resB = await getTransport(parentTokenB);
    expect(resA.body.data.routeNo).toBe('R-7');
    expect(resB.body.data.routeNo).not.toBe('R-7');
    expect(resB.body.data.enrolled).toBe(false);
  });
});

describe('GET /student-transport/live-trip — the live-bus feature, scoped and history-free', () => {
  it('reports the active trip on MY route with the latest point only — NEVER the historical trail', async () => {
    if (!dbAvailable) return;
    const res = await getLiveTrip(parentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
    expect(res.body.data.trip.route).toBe('R-7');
    expect(res.body.data.trip.lastLocation).toEqual({ lat: 19.076, lng: 72.877, timestamp: expect.any(String) });
    expect(res.body.data.trip.trail).toBeUndefined(); // the "no GPS history for parents" guardrail, enforced in the payload itself
  });

  it('is visible to the student viewer too', async () => {
    if (!dbAvailable) return;
    const res = await getLiveTrip(studentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.active).toBe(true);
  });

  it("reports active:false for a student not enrolled in transport at all — never another route's trip", async () => {
    if (!dbAvailable) return;
    const res = await getLiveTrip(parentTokenB);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ active: false, trip: null });
  });
});
