'use strict';

// Integration tests for the teacher documents library: teacher-owned docs
// are private to the owner, a teacher cannot author a school-issued category
// (policy/circular/training), and school-issued docs are read-only (visible
// via /shared, not editable/deletable by any teacher). Skips gracefully if
// no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-documents';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let teacherAToken;
let teacherBToken;
let schoolDoc;

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
        name: 'Documents Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Document'].map((name) => db.model(name).deleteMany({}))
  );

  const principalUser = await db.model('User').create({
    name: 'Doc Principal', email: 'doc-principal@inttest.school', password: PASSWORD, roles: ['principal'], status: 'active',
  });
  const teacherAUser = await db.model('User').create({
    name: 'Doc Teacher A', email: 'doc-teacher-a@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'Doc Teacher B', email: 'doc-teacher-b@inttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });

  await db.model('Teacher').create({
    employeeId: 'DOC-TA', personal: { firstName: 'Doc', lastName: 'A', phone: '9000000071', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  await db.model('Teacher').create({
    employeeId: 'DOC-TB', personal: { firstName: 'Doc', lastName: 'B', phone: '9000000072', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });

  schoolDoc = await db.model('Document').create({
    ownerType: 'school', category: 'policy', title: 'Staff Conduct Policy',
    description: 'School-wide policy.', uploadedBy: principalUser._id,
  });

  teacherAToken = await login(teacherAUser.email);
  teacherBToken = await login(teacherBUser.email);
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

let personalDocId;

describe('POST /documents — category allow-list', () => {
  it('succeeds for an allowed teacher category (personal)', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/documents')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'My Aadhaar', category: 'personal', url: 'https://example.com/aadhaar.pdf' });

    expect(res.status).toBe(201);
    expect(res.body.data.ownerType).toBe('teacher');
    personalDocId = res.body.data._id;
  });

  it('succeeds for certificate with an expiry date', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/documents')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Teaching License', category: 'certificate', url: 'https://example.com/license.pdf', expiryDate: '2099-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.category).toBe('certificate');
  });

  it('rejects category=policy from a teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/documents')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Sneaky Policy', category: 'policy', description: 'Not allowed.' });

    expect(res.status).toBe(422);
  });

  it('rejects category=circular from a teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/documents')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Sneaky Circular', category: 'circular', description: 'Not allowed.' });

    expect(res.status).toBe(422);
  });

  it('rejects category=training from a teacher', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .post('/api/v1/documents')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Sneaky Training', category: 'training', description: 'Not allowed.' });

    expect(res.status).toBe(422);
  });
});

describe('GET /documents/mine — private to the owner', () => {
  it("does not return another teacher's personal documents", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/documents/mine')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });

  it("returns only the requesting teacher's own documents", async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .get('/api/v1/documents/mine')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});

describe('GET /documents/shared — read-only school-issued docs', () => {
  it('is visible to every teacher', async () => {
    if (!dbAvailable) return;
    const resA = await request(app)
      .get('/api/v1/documents/shared')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    const resB = await request(app)
      .get('/api/v1/documents/shared')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);

    expect(resA.body.data.map((d) => d.title)).toContain('Staff Conduct Policy');
    expect(resB.body.data.map((d) => d.title)).toContain('Staff Conduct Policy');
  });

  it('cannot be edited or deleted by any teacher', async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/documents/${schoolDoc._id}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'Hijacked policy' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${schoolDoc._id}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(deleteRes.status).toBe(403);
  });
});

describe('PATCH/DELETE /documents/:id — teacher-owned ownership', () => {
  it("rejects another teacher editing or deleting it", async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/documents/${personalDocId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`)
      .send({ title: 'Hijacked' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${personalDocId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherBToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('lets the owning teacher update and delete it', async () => {
    if (!dbAvailable) return;
    const patchRes = await request(app)
      .patch(`/api/v1/documents/${personalDocId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`)
      .send({ title: 'My Aadhaar (updated)' });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.title).toBe('My Aadhaar (updated)');

    const deleteRes = await request(app)
      .delete(`/api/v1/documents/${personalDocId}`)
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${teacherAToken}`);
    expect(deleteRes.status).toBe(204);
  });
});
