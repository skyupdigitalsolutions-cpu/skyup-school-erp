'use strict';

// Integration tests for the teacher self-service profile: editable fields
// persist, forbidden fields are rejected (not silently dropped), a teacher
// only ever sees their own record, and password change verifies the current
// password. Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-profile';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;

async function login(email, password = PASSWORD) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password });
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
        name: 'Profile Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(['User', 'Teacher'].map((name) => db.model(name).deleteMany({})));

  const teacherAUser = await db.model('User').create({
    name: 'Profile Teacher A', email: 'profile-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'Profile Teacher B', email: 'profile-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  await db.model('Teacher').create({
    employeeId: 'PROF-TA',
    personal: { firstName: 'Profile', lastName: 'TeacherA', phone: '9111100001', email: teacherAUser.email },
    professional: { department: 'Science', designation: 'TGT' },
    userId: teacherAUser._id,
  });
  await db.model('Teacher').create({
    employeeId: 'PROF-TB',
    personal: { firstName: 'Profile', lastName: 'TeacherB', phone: '9111100002', email: teacherBUser.email },
    professional: { department: 'Arts', designation: 'PGT' },
    userId: teacherBUser._id,
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('teacher self-service profile', () => {
  it('lets a teacher update their own editable fields, and it persists', async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({
        personal: {
          phone: '9000011111',
          address: { city: 'Pune', state: 'Maharashtra' },
          emergencyContact: { name: 'Contact A', phone: '9000022222', relation: 'Sibling' },
        },
      });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.personal.phone).toBe('9000011111');

    const getRes = await request(app)
      .get('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(getRes.body.data.personal.phone).toBe('9000011111');
    expect(getRes.body.data.personal.address.city).toBe('Pune');
    expect(getRes.body.data.personal.emergencyContact.name).toBe('Contact A');
  });

  it('rejects a PATCH containing a forbidden field instead of silently dropping it', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ professional: { designation: 'Principal' } });

    expect(res.status).toBe(422);

    // And it genuinely didn't change anything.
    const getRes = await request(app)
      .get('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(getRes.body.data.professional.designation).toBe('TGT');
  });

  it('rejects a top-level forbidden field like employeeId or assignedSubjects', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .patch('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ assignedSubjects: [{ subject: 'Hacked', class: '1', section: 'A', academicYear: '2099-00' }] });

    expect(res.status).toBe(422);
  });

  it("never returns another teacher's data — each token sees only its own profile", async () => {
    if (!dbAvailable) return;
    const resA = await request(app)
      .get('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    const resB = await request(app)
      .get('/api/v1/profile/me')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    expect(resA.body.data.employeeId).toBe('PROF-TA');
    expect(resB.body.data.employeeId).toBe('PROF-TB');
  });

  it('rejects a password change with the wrong current password', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/profile/change-password')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ currentPassword: 'WrongPassword1', newPassword: 'BrandNewPass1', confirmPassword: 'BrandNewPass1' });

    expect(res.status).toBe(401);
  });

  it('changes the password with the correct current password, and the new one logs in', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/profile/change-password')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ currentPassword: PASSWORD, newPassword: 'BrandNewPass1', confirmPassword: 'BrandNewPass1' });

    expect(res.status).toBe(200);

    const newToken = await login('profile-teacher-b@inttest.school', 'BrandNewPass1');
    expect(typeof newToken).toBe('string');
    expect(newToken.length).toBeGreaterThan(10);
  });
});
