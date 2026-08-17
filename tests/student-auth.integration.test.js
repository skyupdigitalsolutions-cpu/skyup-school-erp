'use strict';

// Integration tests for the student/parent portal foundation: login issues a
// token carrying studentId + viewerType (reusing the exact same JWT secrets/
// bcrypt mechanism as staff auth), bad credentials are rejected, and the
// studentScope helper pins strictly to the logged-in student — a token for
// student A's family must never resolve student B's data. Skips gracefully
// if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');
const { getOwnStudent, ownStudentFilter, canSeeFees } = require('../src/utils/studentScope');

const TENANT_SLUG = 'inttest-student-auth';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let studentA;
let studentB;
let parentAccountA;
let studentAccountA;

async function login(email, password = PASSWORD) {
  return request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password });
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
        name: 'Student Auth Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['Student', 'StudentAccount'].map((name) => db.model(name).deleteMany({}))
  );

  const students = await db.model('Student').create([
    {
      admissionNo: 'SA-S1', rollNo: '1',
      personal: { firstName: 'Amara', lastName: 'One' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    },
    {
      admissionNo: 'SA-S2', rollNo: '2',
      personal: { firstName: 'Ben', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '5', section: 'B' },
    },
    {
      admissionNo: 'SA-S3', rollNo: '3',
      personal: { firstName: 'Cara', lastName: 'Three' },
      academic: { academicYear: '2024-25', class: '5', section: 'C' },
    },
  ]);
  studentA = students[0];
  studentB = students[1];
  const studentC = students[2];

  // One student can have BOTH a parent and a student account — the unique
  // {student, viewerType} index allows exactly one of each per student.
  parentAccountA = await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@inttest.school', password: PASSWORD, isActive: true,
  });
  studentAccountA = await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@inttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@inttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentC._id, viewerType: 'parent', email: 'inactive-parent-c@inttest.school', password: PASSWORD, isActive: false,
  });
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('POST /student-auth/login', () => {
  it('issues a token for the parent viewer, and /me reflects it', async () => {
    if (!dbAvailable) return;
    const res = await login('parent-a@inttest.school');
    expect(res.status).toBe(200);
    expect(res.body.data.viewer.viewerType).toBe('parent');
    expect(res.body.data.viewer.studentId).toBe(String(studentA._id));
    expect(res.body.data.viewer.name).toBe('Amara One');

    const meRes = await request(app)
      .get('/api/v1/student-auth/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.viewer.viewerType).toBe('parent');
    expect(meRes.body.data.viewer.studentId).toBe(String(studentA._id));
  });

  it('issues a token for the student viewer (same student, different viewerType)', async () => {
    if (!dbAvailable) return;
    const res = await login('student-a@inttest.school');
    expect(res.status).toBe(200);
    expect(res.body.data.viewer.viewerType).toBe('student');
    expect(res.body.data.viewer.studentId).toBe(String(studentA._id));
  });

  it('rejects a wrong password', async () => {
    if (!dbAvailable) return;
    const res = await login('parent-a@inttest.school', 'WrongPassword1!');
    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    if (!dbAvailable) return;
    const res = await login('nobody@inttest.school');
    expect(res.status).toBe(401);
  });

  it('rejects an inactive account even with the correct password', async () => {
    if (!dbAvailable) return;
    const res = await login('inactive-parent-c@inttest.school');
    expect(res.status).toBe(403);
  });
});

describe('studentScope — pins to the logged-in student only', () => {
  it("ownStudentFilter never resolves another student's id", () => {
    const userA = { studentId: String(studentA._id) };
    const filter = ownStudentFilter(userA);
    expect(filter).toEqual({ _id: String(studentA._id) });
    expect(filter._id).not.toBe(String(studentB._id));
  });

  it('returns a match-nothing filter for a missing/unknown viewer', () => {
    expect(ownStudentFilter(null)).toEqual({ _id: null });
    expect(ownStudentFilter({})).toEqual({ _id: null });
    expect(ownStudentFilter({ studentId: undefined })).toEqual({ _id: null });
  });

  it('getOwnStudent resolves exactly the student embedded in the token, never another one', async () => {
    if (!dbAvailable) return;
    const userA = { studentId: String(studentA._id) };
    const resolved = await getOwnStudent(db, userA);
    expect(String(resolved._id)).toBe(String(studentA._id));
    expect(String(resolved._id)).not.toBe(String(studentB._id));
  });

  it('getOwnStudent returns null for a viewer with no studentId', async () => {
    if (!dbAvailable) return;
    expect(await getOwnStudent(db, {})).toBeNull();
    expect(await getOwnStudent(db, null)).toBeNull();
  });
});

describe('canSeeFees — the child-data safeguard', () => {
  it('is true for parent, false for student, false for anything else', () => {
    expect(canSeeFees('parent')).toBe(true);
    expect(canSeeFees('student')).toBe(false);
    expect(canSeeFees(undefined)).toBe(false);
    expect(canSeeFees('')).toBe(false);
  });
});

describe('cross-account isolation via the real HTTP surface', () => {
  it("student A's token cannot be reused to authenticate as student B (different account ids)", async () => {
    if (!dbAvailable) return;
    const resA = await login('parent-a@inttest.school');
    const meA = await request(app)
      .get('/api/v1/student-auth/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${resA.body.data.accessToken}`);

    expect(meA.body.data.viewer.studentId).toBe(String(studentA._id));
    expect(meA.body.data.viewer.studentId).not.toBe(String(studentB._id));
  });
});
