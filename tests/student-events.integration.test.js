'use strict';

// Integration tests for the student-portal Events feed: a read-only,
// public-face-of-the-event view over the existing staff `Event` model.
// Only 'approved'/'ongoing'/'completed' events are ever visible — never
// 'draft'/'pending_approval'/'cancelled' — and only a strict public-field
// projection is returned, never budget/sponsors/vendors/committees/
// participants/organizer contact/feedback/documents/aiInsights. There is no
// class-targeting field on Event, so every public event is school-wide and
// identical for every viewer. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-events';
const PASSWORD = 'Password123!';
const DAY_MS = 24 * 60 * 60 * 1000;

let app;
let dbAvailable = true;
let parentToken;
let studentToken;
let approvedId;
let draftId;
let cancelledId;

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function get(path, token) {
  return request(app)
    .get(`/api/v1/student-events${path}`)
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
        name: 'Student Events Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(['Student', 'StudentAccount', 'Event'].map((name) => db.model(name).deleteMany({})));

  const student = await db.model('Student').create({
    admissionNo: 'EV-A1', rollNo: '1',
    personal: { firstName: 'Amara', lastName: 'One' },
    academic: { academicYear: '2024-25', class: '5', section: 'A' },
  });

  await db.model('StudentAccount').create({
    student: student._id, viewerType: 'parent', email: 'parent-a@evinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: student._id, viewerType: 'student', email: 'student-a@evinttest.school', password: PASSWORD, isActive: true,
  });

  const now = Date.now();
  const base = {
    academicYear: '2024-25',
    organizer: { name: 'Priya Principal', department: 'Administration', phone: '9999999999', email: 'priya@school.test' },
    committees: [{ role: 'coordinator', name: 'Staff Coordinator', responsibility: 'Overall coordination' }],
    budget: { approved: 50000, utilized: 20000, remaining: 30000, vendors: [{ name: 'Acme Catering', amount: 15000, paid: true }] },
    // NB: Event.sponsors' subdoc literal has a field named `type`, which
    // Mongoose reserves for SchemaType declarations — that collapses the
    // whole field's runtime type to plain `[String]` regardless of the
    // intended shape (a pre-existing quirk in the staff model, out of scope
    // to fix for this read-only task). Match the actual runtime type here.
    sponsors: ['Local Bank Sponsorship'],
    participants: { students: [{ studentId: student._id, name: 'Amara One', class: '5', attended: false }], totalRegistered: 1, totalAttended: 0 },
  };

  const approved = await db.model('Event').create({
    ...base, eventId: 'EV-APPROVED-1', name: 'Annual Sports Day', category: 'sports', status: 'approved',
    description: 'A day of athletics and team sports.',
    schedule: {
      startDate: new Date(now + 10 * DAY_MS), endDate: new Date(now + 10 * DAY_MS),
      agenda: [{ session: 'Opening Ceremony', time: '09:00', speaker: 'Principal', description: 'Welcome address' }],
    },
    venue: { hall: 'Main Ground', room: null, address: '123 School Rd', seatingCapacity: 500, facilities: ['Seating', 'PA System'] },
  });
  approvedId = String(approved._id);

  await db.model('Event').create({
    ...base, eventId: 'EV-ONGOING-1', name: 'Science Exhibition', category: 'academic', status: 'ongoing',
    schedule: { startDate: new Date(now - DAY_MS), endDate: new Date(now + DAY_MS) },
    venue: { hall: 'Auditorium' },
  });

  await db.model('Event').create({
    ...base, eventId: 'EV-COMPLETED-1', name: 'Founders Day', category: 'cultural', status: 'completed',
    schedule: { startDate: new Date(now - 30 * DAY_MS), endDate: new Date(now - 30 * DAY_MS) },
    venue: { hall: 'Main Hall' },
  });

  const draft = await db.model('Event').create({
    ...base, eventId: 'EV-DRAFT-1', name: 'Unapproved Workshop', category: 'academic', status: 'draft',
    schedule: { startDate: new Date(now + 20 * DAY_MS), endDate: new Date(now + 20 * DAY_MS) },
    venue: { hall: 'Room 4' },
  });
  draftId = String(draft._id);

  const pending = await db.model('Event').create({
    ...base, eventId: 'EV-PENDING-1', name: 'Pending Trip', category: 'excursion', status: 'pending_approval',
    schedule: { startDate: new Date(now + 25 * DAY_MS), endDate: new Date(now + 25 * DAY_MS) },
    venue: { hall: null, address: 'Zoo' },
  });

  const cancelled = await db.model('Event').create({
    ...base, eventId: 'EV-CANCELLED-1', name: 'Cancelled Fair', category: 'cultural', status: 'cancelled',
    schedule: { startDate: new Date(now + 5 * DAY_MS), endDate: new Date(now + 5 * DAY_MS) },
    venue: { hall: 'Main Ground' },
  });
  cancelledId = String(cancelled._id);
  void pending;

  parentToken = await loginStudentPortal('parent-a@evinttest.school');
  studentToken = await loginStudentPortal('student-a@evinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-events/me — public statuses only', () => {
  it('includes approved/ongoing/completed events', async () => {
    if (!dbAvailable) return;
    const res = await get('/me', parentToken);
    expect(res.status).toBe(200);
    const names = res.body.data.map((e) => e.name);
    expect(names).toContain('Annual Sports Day');
    expect(names).toContain('Science Exhibition');
    expect(names).toContain('Founders Day');
    expect(res.body.data).toHaveLength(3);
  });

  it('excludes draft, pending_approval, and cancelled events entirely', async () => {
    if (!dbAvailable) return;
    const res = await get('/me', parentToken);
    const names = res.body.data.map((e) => e.name);
    expect(names).not.toContain('Unapproved Workshop');
    expect(names).not.toContain('Pending Trip');
    expect(names).not.toContain('Cancelled Fair');
  });

  it('is visible identically to the student viewer (no class targeting exists)', async () => {
    if (!dbAvailable) return;
    const res = await get('/me', studentToken);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
  });

  it('sorts upcoming events before past ones', async () => {
    if (!dbAvailable) return;
    const res = await get('/me', parentToken);
    const upcomingFlags = res.body.data.map((e) => e.isUpcoming);
    const firstPastIndex = upcomingFlags.indexOf(false);
    if (firstPastIndex !== -1) {
      expect(upcomingFlags.slice(0, firstPastIndex).every(Boolean)).toBe(true);
    }
  });
});

describe('GET /student-events/me — projection excludes sensitive management fields', () => {
  it('never includes budget, sponsors, vendors, committees, participants, or organizer contact info', async () => {
    if (!dbAvailable) return;
    const res = await get('/me', parentToken);
    const payload = JSON.stringify(res.body.data);
    expect(payload).not.toMatch(/budget/i);
    expect(payload).not.toMatch(/sponsor/i);
    expect(payload).not.toMatch(/vendor/i);
    expect(payload).not.toMatch(/committee/i);
    expect(payload).not.toMatch(/participant/i);
    expect(payload).not.toMatch(/organizer/i);
    expect(payload).not.toMatch(/feedback/i);
    expect(payload).not.toMatch(/aiInsight/i);
    expect(payload).not.toMatch(/9999999999/); // organizer phone
    expect(payload).not.toMatch(/priya@school\.test/); // organizer email
    expect(payload).not.toMatch(/Local Bank/); // sponsor name
  });

  it('only returns the allow-listed public fields for a single event', async () => {
    if (!dbAvailable) return;
    const res = await get(`/${approvedId}`, parentToken);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['_id', 'agenda', 'category', 'description', 'endDate', 'isUpcoming', 'name', 'startDate', 'status', 'venue'].sort()
    );
    expect(res.body.data.venue).toEqual({ hall: 'Main Ground', room: null, address: '123 School Rd' });
    expect(res.body.data.name).toBe('Annual Sports Day');
  });
});

describe('GET /student-events/:id — non-public events 404, never leak', () => {
  it('refuses a draft event by id', async () => {
    if (!dbAvailable) return;
    const res = await get(`/${draftId}`, parentToken);
    expect(res.status).toBe(404);
  });

  it('refuses a cancelled event by id', async () => {
    if (!dbAvailable) return;
    const res = await get(`/${cancelledId}`, parentToken);
    expect(res.status).toBe(404);
  });
});
