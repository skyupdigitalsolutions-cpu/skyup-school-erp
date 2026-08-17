'use strict';

// Integration tests for the `/tracking` Socket.IO namespace (real-time bus
// location). This is the security-critical piece of the live-bus feature:
// the handshake must reject an unauthenticated connection outright (never an
// anonymous tracking room), and `join-trip`/`location-update` must enforce
// the exact same scoping as the REST endpoints (staff unscoped, a caretaker
// only their own trip, a parent/student only a trip on their own child's
// route) — never something guessable by trip ID alone. A parent's
// `trip-snapshot` must never include `trail` (historical GPS path is
// staff-only). Uses a REAL http server + socket.io-client, not a mock —
// this logic is exactly the kind that looks right until exercised end to
// end. Skips gracefully if no mongod is reachable.

const http = require('http');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');
const { attachTrackingNamespace } = require('../src/realtime/trackingNamespace');
const { setIo } = require('../src/realtime/ioRegistry');

const TENANT_SLUG = 'inttest-live-tracking';
const PASSWORD = 'Password123!';

let app;
let httpServer;
let port;
let dbAvailable = true;

let caretakerTokenA; // owns the trip on route R-A
let caretakerTokenB; // a different caretaker, does NOT own it
let principalToken;
let parentTokenA; // studentA, enrolled on R-A — owns the trip
let parentTokenB; // studentB, NOT enrolled — must not see it

let tripId;
let studentAId;

function loginStaff(email) {
  return request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD })
    .then((res) => res.body.data.accessToken);
}

function loginStudentPortal(email) {
  return request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD })
    .then((res) => res.body.data.accessToken);
}

const openSockets = [];

function connectSocket({ token, tenantSlug = TENANT_SLUG }) {
  const socket = ioClient(`http://localhost:${port}/tracking`, {
    auth: { token, tenantSlug },
    reconnection: false,
    forceNew: true,
    transports: ['websocket'],
  });
  openSockets.push(socket);
  return socket;
}

/** Resolves once, with whichever of the given events fires first. */
function waitForEither(socket, events, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for one of: ${events.join(', ')}`)), timeoutMs);
    events.forEach((event) => {
      socket.once(event, (payload) => {
        clearTimeout(timer);
        resolve({ event, payload });
      });
    });
  });
}

/** Never rejects — resolves 'event' if it fires within timeoutMs, else 'timeout'. For proving something does NOT happen. */
function waitForEventOrTimeout(socket, event, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('timeout'), timeoutMs);
    socket.once(event, () => {
      clearTimeout(timer);
      resolve('event');
    });
  });
}

beforeAll(async () => {
  try {
    await connectionManager.connect();
  } catch (err) {
    dbAvailable = false;
    return;
  }

  app = createApp();
  httpServer = http.createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });
  attachTrackingNamespace(io);
  setIo(io); // so CaretakerTransportService.arriveTrip's emitTripEnded() reaches this same io instance
  await new Promise((resolve) => httpServer.listen(0, resolve));
  port = httpServer.address().port;

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOneAndUpdate(
    { slug: TENANT_SLUG },
    {
      $set: {
        slug: TENANT_SLUG,
        name: 'Live Tracking Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Caretaker', 'Student', 'StudentAccount', 'BusTrip'].map((name) => db.model(name).deleteMany({}))
  );

  const [studentA, studentB] = await db.model('Student').create([
    {
      admissionNo: 'LT-A1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
      transport: { enrolled: true, routeNo: 'R-A', stopName: 'Stop 1', vehicleNo: 'BUS-A1' },
    },
    {
      admissionNo: 'LT-B1', rollNo: '1',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '5', section: 'B' },
      // not enrolled in transport at all
    },
  ]);
  studentAId = studentA._id;

  const userA = await db.model('User').create({ name: 'Caretaker A', email: 'caretaker-a@ltinttest.school', password: PASSWORD, roles: ['caretaker'], status: 'active' });
  const userB = await db.model('User').create({ name: 'Caretaker B', email: 'caretaker-b@ltinttest.school', password: PASSWORD, roles: ['caretaker'], status: 'active' });
  await db.model('User').create({ name: 'Principal', email: 'principal@ltinttest.school', password: PASSWORD, roles: ['principal'], status: 'active' });

  await db.model('Caretaker').create({
    caretakerId: 'LT-CARE-A', personal: { firstName: 'Caretaker', lastName: 'A', phone: '9000000401' },
    userId: userA._id, loginEnabled: true,
    vehicleDetails: { vehicleNumber: 'BUS-A1', driver: 'Driver A', route: 'R-A' },
    assignedStudents: [
      { studentId: studentA._id, admissionNo: studentA.admissionNo, name: 'Amara One', class: '5', section: 'A', rollNo: '1', pickupPoint: 'Stop 1', dropPoint: 'Stop 1', route: 'R-A' },
    ],
  });
  await db.model('Caretaker').create({
    caretakerId: 'LT-CARE-B', personal: { firstName: 'Caretaker', lastName: 'B', phone: '9000000402' },
    userId: userB._id, loginEnabled: true,
    vehicleDetails: { vehicleNumber: 'BUS-B1', driver: 'Driver B', route: 'R-B' },
    assignedStudents: [],
  });

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@ltinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@ltinttest.school', password: PASSWORD, isActive: true,
  });

  caretakerTokenA = await loginStaff('caretaker-a@ltinttest.school');
  caretakerTokenB = await loginStaff('caretaker-b@ltinttest.school');
  principalToken = await loginStaff('principal@ltinttest.school');
  parentTokenA = await loginStudentPortal('parent-a@ltinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@ltinttest.school');

  const started = await request(app)
    .post('/api/v1/caretaker-transport/trips')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${caretakerTokenA}`)
    .send({ route: 'R-A', direction: 'drop' });
  tripId = started.body.data._id;
}, 30000);

afterAll(async () => {
  // Force-close every client socket this file opened — a test that fails
  // partway through never reaches its own `.close()`, and a lingering
  // websocket keeps httpServer.close() waiting forever.
  openSockets.forEach((socket) => socket.close());
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  if (!dbAvailable) return;
  await connectionManager.closeAll();
}, 20000);

describe('/tracking handshake — never an anonymous connection', () => {
  it('rejects a connection with no token or tenantSlug at all', async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: undefined, tenantSlug: undefined });
    const { event } = await waitForEither(socket, ['connect', 'connect_error']);
    expect(event).toBe('connect_error');
    socket.close();
  });

  it('rejects an invalid/garbage token', async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: 'not-a-real-token' });
    const { event } = await waitForEither(socket, ['connect', 'connect_error']);
    expect(event).toBe('connect_error');
    socket.close();
  });

  it('accepts a real, valid staff token', async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: principalToken });
    const { event } = await waitForEither(socket, ['connect', 'connect_error']);
    expect(event).toBe('connect');
    socket.close();
  });
});

describe('join-trip — authorization mirrors the REST scoping exactly', () => {
  it('a staff (principal) join succeeds and receives the full trail', async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: principalToken });
    await waitForEither(socket, ['connect', 'connect_error']);
    socket.emit('join-trip', { tripId });
    const { event, payload } = await waitForEither(socket, ['trip-snapshot', 'tracking-error']);
    expect(event).toBe('trip-snapshot');
    expect(payload.tripId).toBe(tripId);
    expect(Array.isArray(payload.trail)).toBe(true); // staff view includes trail
    socket.close();
  });

  it('the owning caretaker\'s join succeeds', async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: caretakerTokenA });
    await waitForEither(socket, ['connect', 'connect_error']);
    socket.emit('join-trip', { tripId });
    const { event } = await waitForEither(socket, ['trip-snapshot', 'tracking-error']);
    expect(event).toBe('trip-snapshot');
    socket.close();
  });

  it('a NON-owning caretaker\'s join is refused — not just hidden from their app', async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: caretakerTokenB });
    await waitForEither(socket, ['connect', 'connect_error']);
    socket.emit('join-trip', { tripId });
    const { event } = await waitForEither(socket, ['trip-snapshot', 'tracking-error']);
    expect(event).toBe('tracking-error');
    socket.close();
  });

  it("a parent linked to the enrolled student on this route joins and gets ONLY lastLocation — never the trail", async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: parentTokenA });
    await waitForEither(socket, ['connect', 'connect_error']);
    socket.emit('join-trip', { tripId });
    const { event, payload } = await waitForEither(socket, ['trip-snapshot', 'tracking-error']);
    expect(event).toBe('trip-snapshot');
    expect(payload.trail).toBeUndefined(); // the network-layer guardrail
    socket.close();
  });

  it("a parent whose child is NOT on this route (or not enrolled) is refused — can't view by guessing the trip id", async () => {
    if (!dbAvailable) return;
    const socket = connectSocket({ token: parentTokenB });
    await waitForEither(socket, ['connect', 'connect_error']);
    socket.emit('join-trip', { tripId });
    const { event } = await waitForEither(socket, ['trip-snapshot', 'tracking-error']);
    expect(event).toBe('tracking-error');
    socket.close();
  });
});

describe('location-update — only the owning caretaker can ever publish', () => {
  it("a non-owning caretaker's location-update is silently ignored — no broadcast, no persistence", async () => {
    if (!dbAvailable) return;
    const listener = connectSocket({ token: principalToken });
    await waitForEither(listener, ['connect', 'connect_error']);
    listener.emit('join-trip', { tripId });
    await waitForEither(listener, ['trip-snapshot', 'tracking-error']);

    const impostor = connectSocket({ token: caretakerTokenB });
    await waitForEither(impostor, ['connect', 'connect_error']);
    impostor.emit('location-update', { tripId, lat: 1.111, lng: 1.111 });

    // No 'location' event should ever arrive from this — wait it out without racing a rejection.
    const outcome = await waitForEventOrTimeout(listener, 'location', 1500);
    expect(outcome).toBe('timeout');
    listener.close();
    impostor.close();
  });

  it('the owning caretaker\'s location-update persists and broadcasts to everyone in the room', async () => {
    if (!dbAvailable) return;
    const listener = connectSocket({ token: parentTokenA });
    await waitForEither(listener, ['connect', 'connect_error']);
    listener.emit('join-trip', { tripId });
    await waitForEither(listener, ['trip-snapshot', 'tracking-error']);

    const publisher = connectSocket({ token: caretakerTokenA });
    await waitForEither(publisher, ['connect', 'connect_error']);
    publisher.emit('location-update', { tripId, lat: 19.08, lng: 72.88 });

    const { event, payload } = await waitForEither(listener, ['location']);
    expect(event).toBe('location');
    expect(payload).toMatchObject({ tripId, lat: 19.08, lng: 72.88 });

    const liveTrip = await request(app)
      .get('/api/v1/student-transport/live-trip')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${parentTokenA}`);
    expect(liveTrip.body.data.trip.lastLocation).toMatchObject({ lat: 19.08, lng: 72.88 });

    listener.close();
    publisher.close();
  });
});

describe('trip-ended — broadcast to the room when the caretaker marks arrival', () => {
  it('both a staff and a parent viewer in the room receive trip-ended, not a frozen last position', async () => {
    if (!dbAvailable) return;
    const staffViewer = connectSocket({ token: principalToken });
    await waitForEither(staffViewer, ['connect', 'connect_error']);
    staffViewer.emit('join-trip', { tripId });
    await waitForEither(staffViewer, ['trip-snapshot', 'tracking-error']);

    const parentViewer = connectSocket({ token: parentTokenA });
    await waitForEither(parentViewer, ['connect', 'connect_error']);
    parentViewer.emit('join-trip', { tripId });
    await waitForEither(parentViewer, ['trip-snapshot', 'tracking-error']);

    // Register the listeners BEFORE firing the request — emitTripEnded() runs
    // synchronously inside the request/response cycle, so attaching .once()
    // afterwards would miss an event that already fired and was dropped.
    const staffEndPromise = waitForEither(staffViewer, ['trip-ended']);
    const parentEndPromise = waitForEither(parentViewer, ['trip-ended']);

    await request(app)
      .patch(`/api/v1/caretaker-transport/trips/${tripId}/arrive`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${caretakerTokenA}`)
      .send();

    const [staffEnd, parentEnd] = await Promise.all([staffEndPromise, parentEndPromise]);
    expect(staffEnd.payload).toEqual({ tripId });
    expect(parentEnd.payload).toEqual({ tripId });

    staffViewer.close();
    parentViewer.close();
  });
});
