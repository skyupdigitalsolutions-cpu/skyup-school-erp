'use strict';

// Integration tests for the student/parent self-service "My Profile" page:
// the profile is scoped to the logged-in student only, fees are stripped for
// a student viewer, a parent PATCH of an allow-listed contact field persists,
// a PATCH of a forbidden field (class/roll/admissionNo/feeStatus) is rejected
// instead of silently dropped, and a student viewer cannot PATCH at all.
// Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-profile';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let studentA;
let studentB;
let parentATokenA;
let studentTokenA;
let parentTokenB;

async function loginStudentPortal(email, password = PASSWORD) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password });
  return res.body.data.accessToken;
}

function getProfile(token) {
  return request(app)
    .get('/api/v1/student-profile/me')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${token}`);
}

function patchProfile(token, body) {
  return request(app)
    .patch('/api/v1/student-profile/me')
    .set('X-Tenant-Id', TENANT_SLUG)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
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
        name: 'Student Profile Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(['Student', 'StudentAccount'].map((name) => db.model(name).deleteMany({})));

  const students = await db.model('Student').create([
    {
      admissionNo: 'SP-S1',
      rollNo: '1',
      personal: {
        firstName: 'Priya',
        lastName: 'One',
        address: { line1: 'Old Address', city: 'Mumbai', country: 'India' },
      },
      academic: { academicYear: '2024-25', class: '6', section: 'A' },
      parent: { father: { name: 'Father One', phone: '9000000001', email: 'father-one@old.school' } },
      medical: { emergencyContact: '9000000099' },
      feeStatus: { totalFee: 50000, paidAmount: 20000, dueAmount: 30000, status: 'due' },
    },
    {
      admissionNo: 'SP-S2',
      rollNo: '2',
      personal: { firstName: 'Rohan', lastName: 'Two' },
      academic: { academicYear: '2024-25', class: '6', section: 'B' },
      feeStatus: { totalFee: 40000, paidAmount: 40000, dueAmount: 0, status: 'paid' },
    },
  ]);
  studentA = students[0];
  studentB = students[1];

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@spinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@spinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@spinttest.school', password: PASSWORD, isActive: true,
  });

  parentATokenA = await loginStudentPortal('parent-a@spinttest.school');
  studentTokenA = await loginStudentPortal('student-a@spinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@spinttest.school');
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('GET /student-profile/me', () => {
  it("returns the parent viewer's own student, including fees", async () => {
    if (!dbAvailable) return;
    const res = await getProfile(parentATokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.admissionNo).toBe('SP-S1');
    expect(res.body.data.personal.firstName).toBe('Priya');
    expect(res.body.data.feeStatus).toBeDefined();
    expect(res.body.data.feeStatus.dueAmount).toBe(30000);
  });

  it('strips fees for the student viewer of the same student', async () => {
    if (!dbAvailable) return;
    const res = await getProfile(studentTokenA);
    expect(res.status).toBe(200);
    expect(res.body.data.admissionNo).toBe('SP-S1');
    expect(res.body.data.feeStatus).toBeUndefined();
  });

  it("never resolves another student's profile — parent B never sees student A's data", async () => {
    if (!dbAvailable) return;
    const res = await getProfile(parentTokenB);
    expect(res.status).toBe(200);
    expect(res.body.data.admissionNo).toBe('SP-S2');
    expect(res.body.data.admissionNo).not.toBe('SP-S1');
  });
});

describe('PATCH /student-profile/me — parent-editable contact fields', () => {
  it('lets a parent update an allow-listed contact field, and it persists', async () => {
    if (!dbAvailable) return;
    const res = await patchProfile(parentATokenA, {
      medical: { emergencyContact: '9111111111' },
      personal: { address: { line1: 'New Address', city: 'Pune', country: 'India' } },
      parent: { father: { phone: '9222222222', email: 'father-one@new.school' } },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.medical.emergencyContact).toBe('9111111111');
    expect(res.body.data.personal.address.city).toBe('Pune');
    expect(res.body.data.parent.father.phone).toBe('9222222222');

    const getRes = await getProfile(parentATokenA);
    expect(getRes.body.data.medical.emergencyContact).toBe('9111111111');
    expect(getRes.body.data.personal.address.line1).toBe('New Address');
    expect(getRes.body.data.parent.father.email).toBe('father-one@new.school');
  });

  it('rejects a PATCH changing class/section instead of silently dropping it', async () => {
    if (!dbAvailable) return;
    const res = await patchProfile(parentATokenA, { academic: { class: '9', section: 'Z' } });
    expect(res.status).toBe(422);

    const getRes = await getProfile(parentATokenA);
    expect(getRes.body.data.academic.class).toBe('6');
    expect(getRes.body.data.academic.section).toBe('A');
  });

  it('rejects a PATCH changing rollNo/admissionNo', async () => {
    if (!dbAvailable) return;
    const res = await patchProfile(parentATokenA, { rollNo: '999', admissionNo: 'HACKED-1' });
    expect(res.status).toBe(422);

    const getRes = await getProfile(parentATokenA);
    expect(getRes.body.data.rollNo).toBe('1');
    expect(getRes.body.data.admissionNo).toBe('SP-S1');
  });

  it('rejects a PATCH changing feeStatus', async () => {
    if (!dbAvailable) return;
    const res = await patchProfile(parentATokenA, { feeStatus: { dueAmount: 0, status: 'paid' } });
    expect(res.status).toBe(422);

    const getRes = await getProfile(parentATokenA);
    expect(getRes.body.data.feeStatus.dueAmount).toBe(30000);
    expect(getRes.body.data.feeStatus.status).toBe('due');
  });

  it('rejects any PATCH from a student viewer, even an allow-listed field', async () => {
    if (!dbAvailable) return;
    const res = await patchProfile(studentTokenA, { medical: { emergencyContact: '9333333333' } });
    expect(res.status).toBe(403);

    const getRes = await getProfile(parentATokenA);
    expect(getRes.body.data.medical.emergencyContact).toBe('9111111111');
  });
});
