'use strict';

// Integration tests for the Authorization module: AuthService now issues a
// REAL effective permission set at login (the union of every one of the
// user's roles' granted permissions), replacing the previously-hardcoded
// `permissions: []` that made every `requirePermissions(...)`-gated route
// 403 for everyone except administrator. Confirms the exact regression this
// was built to fix (principal's own Student/Teacher management pages were
// 403ing) and the exact scope boundary the brief called for (finance reads,
// never writes). Skips gracefully if no mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-authorization';
const PASSWORD = 'Password123!';

let app;
let db;
let dbAvailable = true;
let principalToken;
let financeToken;
let teacherToken;
let multiRoleToken; // roles: ['teacher', 'finance']
let adminToken;

async function login(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res;
}

function decodeToken(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

function api(token) {
  const withAuth = (req) => req.set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`);
  return {
    get: (path) => withAuth(request(app).get(path)),
    post: (path, body) => withAuth(request(app).post(path).send(body)),
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
        name: 'Authorization Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(['User', 'RolePermission', 'Student', 'Teacher'].map((name) => db.model(name).deleteMany({})));

  await db.model('User').create({ name: 'Priya Principal', email: 'principal@authztest.school', password: PASSWORD, roles: ['principal'], status: 'active' });
  await db.model('User').create({ name: 'Fatima Finance', email: 'finance@authztest.school', password: PASSWORD, roles: ['finance'], status: 'active' });
  await db.model('User').create({ name: 'Tariq Teacher', email: 'teacher@authztest.school', password: PASSWORD, roles: ['teacher'], status: 'active' });
  await db.model('User').create({ name: 'Multi Role', email: 'multi@authztest.school', password: PASSWORD, roles: ['teacher', 'finance'], status: 'active' });
  await db.model('User').create({ name: 'Ada Admin', email: 'admin@authztest.school', password: PASSWORD, roles: ['administrator'], status: 'active' });

  const principalRes = await login('principal@authztest.school');
  const financeRes = await login('finance@authztest.school');
  const teacherRes = await login('teacher@authztest.school');
  const multiRes = await login('multi@authztest.school');
  const adminRes = await login('admin@authztest.school');
  principalToken = principalRes.body.data.accessToken;
  financeToken = financeRes.body.data.accessToken;
  teacherToken = teacherRes.body.data.accessToken;
  multiRoleToken = multiRes.body.data.accessToken;
  adminToken = adminRes.body.data.accessToken;
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('AuthService issues real permissions — the root-cause fix', () => {
  it("a principal's token carries student:manage/teacher:manage (union from RolePermission), not an empty array", async () => {
    if (!dbAvailable) return;
    const decoded = decodeToken(principalToken);
    expect(decoded.permissions).toEqual(expect.arrayContaining(['student:manage', 'teacher:manage']));
  });

  it("finance's token carries ONLY student:read/teacher:read — never a write permission", async () => {
    if (!dbAvailable) return;
    const decoded = decodeToken(financeToken);
    expect(decoded.permissions.sort()).toEqual(['student:read', 'teacher:read']);
  });

  it('a multi-role user (teacher + finance) gets the UNION, deduplicated', async () => {
    if (!dbAvailable) return;
    const decoded = decodeToken(multiRoleToken);
    // teacher grants student:read; finance grants student:read + teacher:read — union is exactly these two, no duplicate student:read.
    expect(decoded.permissions.sort()).toEqual(['student:read', 'teacher:read']);
  });

  it("administrator's token still carries no explicit grants — the middleware bypass is role-based, not grant-based", async () => {
    if (!dbAvailable) return;
    const decoded = decodeToken(adminToken);
    expect(decoded.permissions).toEqual([]);
  });
});

describe('Regression proof: the previously-403ing routes now work', () => {
  it('finance can read /principal/students and /principal/teachers (was 403 before this fix)', async () => {
    if (!dbAvailable) return;
    const studentsRes = await api(financeToken).get('/api/v1/principal/students');
    const teachersRes = await api(financeToken).get('/api/v1/principal/teachers');
    expect(studentsRes.status).toBe(200);
    expect(teachersRes.status).toBe(200);
  });

  it('finance is still refused WRITE access to students/teachers (403, not a weakened boundary)', async () => {
    if (!dbAvailable) return;
    const res = await api(financeToken).post('/api/v1/principal/students', {
      admissionNo: 'AUTHZ-FIN-1', personal: { firstName: 'X', lastName: 'Y' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    });
    expect(res.status).toBe(403);
  });

  it('a non-administrator principal can now fully manage students (create) and teachers (was 403 before this fix)', async () => {
    if (!dbAvailable) return;
    const studentRes = await api(principalToken).post('/api/v1/principal/students', {
      admissionNo: 'AUTHZ-P-1', personal: { firstName: 'Real', lastName: 'Student' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    });
    expect(studentRes.status).toBe(201);

    const teacherRes = await api(principalToken).post('/api/v1/principal/teachers', {
      employeeId: 'AUTHZ-T-1',
      personal: { firstName: 'Real', lastName: 'Teacher', phone: '9000000501', email: 'real.teacher@authztest.school' },
      professional: { department: 'General', designation: 'TGT' },
    });
    expect(teacherRes.status).toBe(201);
  });

  it("teacher's own role permission (student:read only) lets them read students but not write, and grants no teacher-directory access", async () => {
    if (!dbAvailable) return;
    const readRes = await api(teacherToken).get('/api/v1/principal/students');
    expect(readRes.status).toBe(200);

    const writeRes = await api(teacherToken).post('/api/v1/principal/students', {
      admissionNo: 'AUTHZ-TCH-1', personal: { firstName: 'X', lastName: 'Y' },
      academic: { academicYear: '2024-25', class: '5', section: 'A' },
    });
    expect(writeRes.status).toBe(403);

    const teacherDirRes = await api(teacherToken).get('/api/v1/principal/teachers');
    expect(teacherDirRes.status).toBe(403);
  });
});

describe('Seed idempotency — never duplicates, never wipes a custom grant', () => {
  it('re-running ensureDefaultsSeeded twice creates exactly one RolePermission doc per default role', async () => {
    if (!dbAvailable) return;
    const svc = require('../src/modules/authorization/services/AuthorizationService');
    await svc.ensureDefaultsSeeded(db);
    await svc.ensureDefaultsSeeded(db);

    const principalDocs = await db.model('RolePermission').find({ role: 'principal' }).lean();
    expect(principalDocs).toHaveLength(1);
  });

  it("a custom grant an administrator makes at runtime survives re-seeding", async () => {
    if (!dbAvailable) return;
    const svc = require('../src/modules/authorization/services/AuthorizationService');

    // Administrator customizes teacher's grant to add teacher:read too.
    const updateRes = await request(app)
      .patch('/api/v1/authorization/roles/teacher')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: ['student:read', 'teacher:read'] });
    expect(updateRes.status).toBe(200);

    await svc.ensureDefaultsSeeded(db); // must NOT revert the custom grant back to the default

    const teacherDoc = await db.model('RolePermission').findOne({ role: 'teacher' }).lean();
    expect(teacherDoc.permissions.sort()).toEqual(['student:read', 'teacher:read']);
  });

  it('administrator cannot grant an unenforced/unknown permission string', async () => {
    if (!dbAvailable) return;
    const res = await request(app)
      .patch('/api/v1/authorization/roles/finance')
      .set('X-Tenant-Id', TENANT_SLUG)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ permissions: ['fee:read'] }); // not enforced anywhere — not in the catalog
    expect(res.status).toBe(400);
  });

  it('a non-administrator cannot view or edit role permissions', async () => {
    if (!dbAvailable) return;
    const res = await api(principalToken).get('/api/v1/authorization/roles');
    expect(res.status).toBe(403);
  });
});
