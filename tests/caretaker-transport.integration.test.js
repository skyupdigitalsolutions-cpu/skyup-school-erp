'use strict';

// Integration tests for the caretaker (van) portal's bus-trip logging.
// Scoped entirely through `Caretaker.assignedStudents`/`vehicleDetails.route`
// (there is no separate TransportRoute model in this codebase — see
// caretakerScope.js's own comment). Login reuses the SAME staff `/auth/login`
// mechanism as teacher/principal — no new auth system. departedAt/arrivedAt/
// each student log's timestamp are always server-set. Re-marking a student
// upserts the same row (unique on busTrip+student), never duplicating.
// Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-caretaker-transport';
const PASSWORD = 'Password123!';

let app;
let dbAvailable = true;
let caretakerTokenA; // route R-A
let caretakerTokenB; // route R-B
let principalToken;
let teacherToken;
let studentA1;
let studentA2;
let studentB1;

async function login(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function api(token) {
  const base = (method, path) => request(app)[method](`/api/v1/caretaker-transport${path}`).set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`);
  return {
    myRoutes: () => base('get', '/my-routes'),
    startTrip: (body) => base('post', '/trips').send(body),
    arrive: (id) => base('patch', `/trips/${id}/arrive`),
    logStudent: (id, body) => base('post', `/trips/${id}/student-log`).send(body),
    listTrips: (date) => base('get', `/trips${date ? `?date=${date}` : ''}`),
    getProfile: () => base('get', '/profile'),
    updateProfile: (body) => base('patch', '/profile').send(body),
    activeTrips: () => base('get', '/active-trips'),
  };
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
        name: 'Caretaker Transport Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Caretaker', 'Student', 'BusTrip', 'BusTripStudentLog'].map((name) => db.model(name).deleteMany({}))
  );

  const students = await db.model('Student').create([
    {
      admissionNo: 'CTR-1', rollNo: '1', personal: { firstName: 'Amara', lastName: 'One' }, academic: { academicYear: '2024-25', class: '6', section: 'A' },
      parent: { father: { name: 'Papa One', phone: '9111100001' }, mother: { name: 'Mama One', phone: '9111100002' }, primaryContact: 'mother' },
    },
    {
      admissionNo: 'CTR-2', rollNo: '2', personal: { firstName: 'Ben', lastName: 'Two' }, academic: { academicYear: '2024-25', class: '6', section: 'A' },
      // No phone on the primary (father) contact — must fall back to mother's.
      parent: { father: { name: 'Papa Two' }, mother: { name: 'Mama Two', phone: '9111100004' }, primaryContact: 'father' },
    },
    { admissionNo: 'CTR-3', rollNo: '1', personal: { firstName: 'Cara', lastName: 'Three' }, academic: { academicYear: '2024-25', class: '7', section: 'B' } },
  ]);
  [studentA1, studentA2, studentB1] = students;

  const userA = await db.model('User').create({ name: 'Caretaker A', email: 'caretaker-a@ctrinttest.school', password: PASSWORD, roles: ['caretaker'], status: 'active' });
  const userB = await db.model('User').create({ name: 'Caretaker B', email: 'caretaker-b@ctrinttest.school', password: PASSWORD, roles: ['caretaker'], status: 'active' });
  await db.model('User').create({ name: 'Principal', email: 'principal@ctrinttest.school', password: PASSWORD, roles: ['principal'], status: 'active' });
  await db.model('User').create({ name: 'Teacher', email: 'teacher@ctrinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active' });

  await db.model('Caretaker').create({
    caretakerId: 'CTR-CARE-A', personal: { firstName: 'Caretaker', lastName: 'A', phone: '9000000301' },
    userId: userA._id, loginEnabled: true,
    vehicleDetails: { vehicleNumber: 'BUS-A1', driver: 'Driver A', route: 'R-A' },
    assignedStudents: [
      { studentId: studentA1._id, admissionNo: studentA1.admissionNo, name: 'Amara One', class: '6', section: 'A', rollNo: '1', pickupPoint: 'Stop 1', dropPoint: 'Stop 1', route: 'R-A' },
      { studentId: studentA2._id, admissionNo: studentA2.admissionNo, name: 'Ben Two', class: '6', section: 'A', rollNo: '2', pickupPoint: 'Stop 2', dropPoint: 'Stop 2', route: 'R-A' },
    ],
  });

  await db.model('Caretaker').create({
    caretakerId: 'CTR-CARE-B', personal: { firstName: 'Caretaker', lastName: 'B', phone: '9000000302' },
    userId: userB._id, loginEnabled: true,
    vehicleDetails: { vehicleNumber: 'BUS-B1', driver: 'Driver B', route: 'R-B' },
    assignedStudents: [
      { studentId: studentB1._id, admissionNo: studentB1.admissionNo, name: 'Cara Three', class: '7', section: 'B', rollNo: '1', pickupPoint: 'Stop 9', dropPoint: 'Stop 9', route: 'R-B' },
    ],
  });

  caretakerTokenA = await login('caretaker-a@ctrinttest.school');
  caretakerTokenB = await login('caretaker-b@ctrinttest.school');
  principalToken = await login('principal@ctrinttest.school');
  teacherToken = await login('teacher@ctrinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /caretaker-transport/my-routes — scoped to the caretaker\'s own route(s)', () => {
  it("returns caretaker A's own route with only their own roster", async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).myRoutes();
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].route).toBe('R-A');
    expect(res.body.data[0].students).toHaveLength(2);
    expect(res.body.data[0].students.map((s) => s.name)).not.toContain('Cara Three');
  });

  it('resolves each student\'s LIVE parent contact (primary contact, with phone fallback)', async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).myRoutes();
    const students = res.body.data[0].students;

    const amara = students.find((s) => s.name === 'Amara One');
    expect(amara.parentContact).toEqual({ name: 'Mama One', phone: '9111100002', relation: 'mother' });

    // Ben's primary contact (father) has no phone — falls back to mother's.
    const ben = students.find((s) => s.name === 'Ben Two');
    expect(ben.parentContact).toEqual({ name: 'Mama Two', phone: '9111100004', relation: 'mother' });
  });

  it("never exposes another route's stops, vehicle, or parent contacts", async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).myRoutes();
    const payload = JSON.stringify(res.body.data);
    expect(payload).not.toMatch(/Cara Three/);
    expect(payload).not.toMatch(/BUS-B1/);
    expect(payload).not.toMatch(/Stop 9/);
  });

  it('includes stops (deduped, no fabricated sequence) and the caretaker\'s own phone as the vehicle contact', async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).myRoutes();
    expect(res.body.data[0].stops).toEqual(['Stop 1', 'Stop 2']);
    expect(res.body.data[0].caretakerPhone).toBe('9000000301');
  });
});

describe('GET/PATCH /caretaker-transport/profile — own profile only, allow-list update', () => {
  it("returns the caretaker's own profile", async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).getProfile();
    expect(res.status).toBe(200);
    expect(res.body.data.caretakerId).toBe('CTR-CARE-A');
    expect(res.body.data.routes).toEqual(['R-A']);
  });

  it('updates own phone/email', async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).updateProfile({ personal: { phone: '9000009999', email: 'updated@ctrinttest.school' } });
    expect(res.status).toBe(200);
    expect(res.body.data.personal.phone).toBe('9000009999');
    expect(res.body.data.personal.email).toBe('updated@ctrinttest.school');
  });

  it('rejects an attempt to sneak in a route/vehicle change via the allow-list (422, stripUnknown:false)', async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).updateProfile({ vehicleDetails: { route: 'R-B' } });
    expect(res.status).toBe(422);

    // Confirm the route genuinely didn't change.
    const profile = await api(caretakerTokenA).getProfile();
    expect(profile.body.data.routes).toEqual(['R-A']);
  });
});

describe('POST /caretaker-transport/trips — start a trip, server-stamped departedAt', () => {
  it('starts a trip on the caretaker\'s own route with departedAt set to server time', async () => {
    if (!dbAvailable) return;
    const before = Date.now();
    const res = await api(caretakerTokenA).startTrip({ route: 'R-A', direction: 'drop' });
    const after = Date.now();
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('in_progress');
    const departedAt = new Date(res.body.data.departedAt).getTime();
    expect(departedAt).toBeGreaterThanOrEqual(before);
    expect(departedAt).toBeLessThanOrEqual(after);
  });

  it("rejects starting a trip on a route the caretaker is NOT assigned to", async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).startTrip({ route: 'R-B', direction: 'drop' });
    expect(res.status).toBe(403);
  });

  it('ignores a client-supplied departedAt-like field — the client cannot influence the timestamp at all', async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenB).startTrip({ route: 'R-B', direction: 'pickup', departedAt: '2000-01-01T00:00:00.000Z' });
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.departedAt).getFullYear()).not.toBe(2000);
  });
});

describe('POST /caretaker-transport/trips/:id/student-log — scoped, upserts, server timestamp', () => {
  let tripId;

  beforeAll(async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).startTrip({ route: 'R-A', direction: 'drop' });
    tripId = res.body.data._id;
  });

  it('marks a student on the caretaker\'s own route', async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).logStudent(tripId, { studentId: studentA1._id, action: 'dropped' });
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('dropped');
    expect(res.body.data.stop).toBe('Stop 1');
  });

  it("rejects marking a student who is NOT on the caretaker's route", async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenA).logStudent(tripId, { studentId: studentB1._id, action: 'dropped' });
    expect(res.status).toBe(403);
  });

  it("rejects logging against another caretaker's trip entirely (404, no leak)", async () => {
    if (!dbAvailable) return;
    const res = await api(caretakerTokenB).logStudent(tripId, { studentId: studentA1._id, action: 'dropped' });
    expect(res.status).toBe(404);
  });

  it('re-marking the SAME student upserts (corrects) rather than duplicating', async () => {
    if (!dbAvailable) return;
    await api(caretakerTokenA).logStudent(tripId, { studentId: studentA2._id, action: 'absent' });
    const corrected = await api(caretakerTokenA).logStudent(tripId, { studentId: studentA2._id, action: 'dropped' });
    expect(corrected.body.data.action).toBe('dropped');

    const trips = await api(caretakerTokenA).listTrips();
    const trip = trips.body.data.find((t) => t._id === tripId);
    const a2Logs = trip.studentLogs.filter((l) => String(l.student) === String(studentA2._id));
    expect(a2Logs).toHaveLength(1); // exactly one row, not two
  });
});

describe('PATCH /caretaker-transport/trips/:id/arrive — completes a trip, server-stamped arrivedAt', () => {
  it('completes the trip with arrivedAt at server time', async () => {
    if (!dbAvailable) return;
    const started = await api(caretakerTokenA).startTrip({ route: 'R-A', direction: 'pickup' });
    const tripId = started.body.data._id;

    const before = Date.now();
    const res = await api(caretakerTokenA).arrive(tripId);
    const after = Date.now();
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
    const arrivedAt = new Date(res.body.data.arrivedAt).getTime();
    expect(arrivedAt).toBeGreaterThanOrEqual(before);
    expect(arrivedAt).toBeLessThanOrEqual(after);
  });

  it('rejects arriving an already-completed trip', async () => {
    if (!dbAvailable) return;
    const started = await api(caretakerTokenA).startTrip({ route: 'R-A', direction: 'pickup' });
    const tripId = started.body.data._id;
    await api(caretakerTokenA).arrive(tripId);
    const res = await api(caretakerTokenA).arrive(tripId);
    expect(res.status).toBe(409);
  });

  it("rejects completing another caretaker's trip (404, no leak)", async () => {
    if (!dbAvailable) return;
    const started = await api(caretakerTokenB).startTrip({ route: 'R-B', direction: 'pickup' });
    const res = await api(caretakerTokenA).arrive(started.body.data._id);
    expect(res.status).toBe(404);
  });
});

describe('GET /caretaker-transport/trips — trip history scoped to the caretaker', () => {
  it("never includes another caretaker's trips", async () => {
    if (!dbAvailable) return;
    const resA = await api(caretakerTokenA).listTrips();
    const resB = await api(caretakerTokenB).listTrips();
    const aRoutes = new Set(resA.body.data.map((t) => t.route));
    const bRoutes = new Set(resB.body.data.map((t) => t.route));
    expect(aRoutes.has('R-B')).toBe(false);
    expect(bRoutes.has('R-A')).toBe(false);
  });
});

describe('GET /caretaker-transport/active-trips — principal/administrator only, unscoped, for the live map', () => {
  it('lists every in-progress trip across every route, with caretaker/vehicle info', async () => {
    if (!dbAvailable) return;
    const started = await api(caretakerTokenA).startTrip({ route: 'R-A', direction: 'drop' });
    const tripId = started.body.data._id;

    const res = await api(principalToken).activeTrips();
    expect(res.status).toBe(200);
    const found = res.body.data.find((t) => t.tripId === tripId);
    expect(found).toBeTruthy();
    expect(found.vehicleNo).toBe('BUS-A1');
    expect(found.caretakerName).toBe('Caretaker A');

    await api(caretakerTokenA).arrive(tripId); // clean up — end the trip
  });

  it('is refused to a caretaker or teacher — not just hidden from their nav', async () => {
    if (!dbAvailable) return;
    const caretakerRes = await api(caretakerTokenA).activeTrips();
    const teacherRes = await api(teacherToken).activeTrips();
    expect(caretakerRes.status).toBe(403);
    expect(teacherRes.status).toBe(403);
  });
});
