'use strict';

// Integration tests for student leave-of-absence requests: a SEPARATE model
// from the staff HR `LeaveRequest` (teacher/caretaker leave, untouched here).
// Parent/student can create/list/cancel their OWN student's requests only;
// the student's class teacher (or principal/administrator, unscoped) can
// approve/reject, mirroring the staff-leave decide() semantics exactly
// (pending-only decide, 409 if already decided). Skips gracefully if no
// mongod is reachable.

const request = require('supertest');
const createApp = require('../src/app');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const config = require('../src/config');

const TENANT_SLUG = 'inttest-student-leave';
const PASSWORD = 'Password123!';

let app;
let dbAvailable = true;
let parentTokenA; // class 6-A student
let studentTokenA; // same student, viewerType 'student'
let parentTokenB; // class 6-B student (different class teacher)
let classATeacherToken; // class teacher of 6-A
let classBTeacherToken; // class teacher of 6-B
let principalToken;

async function loginStudentPortal(email) {
  const res = await request(app)
    .post('/api/v1/student-auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

async function loginStaff(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('X-Tenant-Id', TENANT_SLUG)
    .send({ email, password: PASSWORD });
  return res.body.data.accessToken;
}

function asParent(token) {
  return {
    create: (body) => request(app).post('/api/v1/student-leave-requests').set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`).send(body),
    listMine: () => request(app).get('/api/v1/student-leave-requests/me').set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`),
    cancel: (id) => request(app).post(`/api/v1/student-leave-requests/${id}/cancel`).set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`),
  };
}

function asStaff(token) {
  return {
    listPending: (status) => request(app).get(`/api/v1/student-leave-requests/staff${status ? `?status=${status}` : ''}`).set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`),
    approve: (id, remarks) => request(app).post(`/api/v1/student-leave-requests/staff/${id}/approve`).set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`).send({ remarks }),
    reject: (id, remarks) => request(app).post(`/api/v1/student-leave-requests/staff/${id}/reject`).set('X-Tenant-Id', TENANT_SLUG).set('Authorization', `Bearer ${token}`).send({ remarks }),
  };
}

let studentA;

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
        name: 'Student Leave Test School',
        dbName: `${config.db.tenantDbPrefix}${TENANT_SLUG}`,
        status: 'active',
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  const db = await connectionManager.getTenantConnection(tenant);

  await Promise.all(
    ['User', 'Teacher', 'Class', 'Student', 'StudentAccount', 'StudentLeaveRequest'].map((name) => db.model(name).deleteMany({}))
  );

  const principalUser = await db.model('User').create({
    name: 'Priya Principal', email: 'principal@slinttest.school', password: PASSWORD, roles: ['principal'], status: 'active',
  });
  principalToken = await loginStaff('principal@slinttest.school');

  const teacherAUser = await db.model('User').create({
    name: 'Teacher A', email: 'teacher-a@slinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherBUser = await db.model('User').create({
    name: 'Teacher B', email: 'teacher-b@slinttest.school', password: PASSWORD, roles: ['teacher'], status: 'active',
  });
  const teacherA = await db.model('Teacher').create({
    employeeId: 'SL-T1', personal: { firstName: 'Teacher', lastName: 'A', phone: '9000000101', email: teacherAUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherAUser._id,
  });
  const teacherB = await db.model('Teacher').create({
    employeeId: 'SL-T2', personal: { firstName: 'Teacher', lastName: 'B', phone: '9000000102', email: teacherBUser.email },
    professional: { department: 'General', designation: 'TGT' }, userId: teacherBUser._id,
  });
  classATeacherToken = await loginStaff('teacher-a@slinttest.school');
  classBTeacherToken = await loginStaff('teacher-b@slinttest.school');

  // Class.{name, academicYear} is uniquely indexed (one classTeacher per
  // grade name, not per-section) — so classA/classB need distinct names.
  const classA = await db.model('Class').create({ name: '6', academicYear: '2024-25', sections: ['A'], classTeacher: teacherA._id });
  await db.model('Class').create({ name: '7', academicYear: '2024-25', sections: ['B'], classTeacher: teacherB._id });

  studentA = await db.model('Student').create({
    admissionNo: 'SL-A1', rollNo: '1',
    personal: { firstName: 'Amara', lastName: 'One' },
    academic: { academicYear: '2024-25', class: '6', section: 'A' },
  });
  const studentB = await db.model('Student').create({
    admissionNo: 'SL-B1', rollNo: '1',
    personal: { firstName: 'Ben', lastName: 'Two' },
    academic: { academicYear: '2024-25', class: '7', section: 'B' },
  });
  void classA;

  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'parent', email: 'parent-a@slinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentA._id, viewerType: 'student', email: 'student-a@slinttest.school', password: PASSWORD, isActive: true,
  });
  await db.model('StudentAccount').create({
    student: studentB._id, viewerType: 'parent', email: 'parent-b@slinttest.school', password: PASSWORD, isActive: true,
  });

  parentTokenA = await loginStudentPortal('parent-a@slinttest.school');
  studentTokenA = await loginStudentPortal('student-a@slinttest.school');
  parentTokenB = await loginStudentPortal('parent-b@slinttest.school');
  void principalUser;
}, 30000);

afterAll(async () => {
  if (!dbAvailable) return;
  await connectionManager.closeAll();
});

describe('POST /student-leave-requests — create for own student only', () => {
  it('creates a pending request with computed totalDays', async () => {
    if (!dbAvailable) return;
    const res = await asParent(parentTokenA).create({
      leaveType: 'sick', fromDate: '2025-01-10', toDate: '2025-01-12', reason: 'Fever',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.totalDays).toBe(3);
    expect(res.body.data.student).toBe(String(studentA._id));
  });

  it('rejects toDate before fromDate', async () => {
    if (!dbAvailable) return;
    const res = await asParent(parentTokenA).create({
      leaveType: 'travel', fromDate: '2025-02-05', toDate: '2025-02-01', reason: 'Trip',
    });
    expect(res.status).toBe(400);
  });

  it('requires a reason', async () => {
    if (!dbAvailable) return;
    const res = await asParent(parentTokenA).create({
      leaveType: 'other', fromDate: '2025-03-01', toDate: '2025-03-01', reason: '',
    });
    // Caught by Joi body validation (422) before it ever reaches the service.
    expect(res.status).toBe(422);
  });
});

describe('GET /student-leave-requests/me — scoped to the logged-in student only', () => {
  it("never shows another student's requests", async () => {
    if (!dbAvailable) return;
    const resA = await asParent(parentTokenA).listMine();
    const resB = await asParent(parentTokenB).listMine();
    expect(resA.body.data.length).toBeGreaterThan(0);
    expect(resB.body.data).toEqual([]);
  });

  it('is visible identically to the student viewer', async () => {
    if (!dbAvailable) return;
    const res = await asParent(studentTokenA).listMine();
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });
});

describe('POST /student-leave-requests/:id/cancel — own + pending only', () => {
  it('cancels a pending request of its own', async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'family', fromDate: '2025-04-01', toDate: '2025-04-01', reason: 'Family function',
    });
    const res = await asParent(parentTokenA).cancel(created.body.data._id);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });

  it("refuses to cancel another student's request (404, no leak)", async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'other', fromDate: '2025-05-01', toDate: '2025-05-01', reason: 'Personal',
    });
    const res = await asParent(parentTokenB).cancel(created.body.data._id);
    expect(res.status).toBe(404);
  });

  it('cannot cancel an already-decided request', async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'sick', fromDate: '2025-06-01', toDate: '2025-06-01', reason: 'Checkup',
    });
    await asStaff(classATeacherToken).approve(created.body.data._id, 'OK');
    const res = await asParent(parentTokenA).cancel(created.body.data._id);
    expect(res.status).toBe(409);
  });
});

describe('Staff decide() — scoped to the class teacher\'s own class, unscoped for principal', () => {
  it('lists pending requests for the class teacher of the student\'s class', async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'travel', fromDate: '2025-07-01', toDate: '2025-07-02', reason: 'Family trip',
    });
    const res = await asStaff(classATeacherToken).listPending('pending');
    expect(res.status).toBe(200);
    expect(res.body.data.some((r) => r._id === created.body.data._id)).toBe(true);
  });

  it("a different class's teacher cannot see or decide this student's request", async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'sick', fromDate: '2025-08-01', toDate: '2025-08-01', reason: 'Fever again',
    });
    const listRes = await asStaff(classBTeacherToken).listPending('pending');
    expect(listRes.body.data.some((r) => r._id === created.body.data._id)).toBe(false);

    const decideRes = await asStaff(classBTeacherToken).approve(created.body.data._id, 'nope');
    expect(decideRes.status).toBe(404);
  });

  it('approves a pending request, recording decidedBy/decidedAt', async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'family', fromDate: '2025-09-01', toDate: '2025-09-01', reason: 'Wedding',
    });
    const res = await asStaff(classATeacherToken).approve(created.body.data._id, 'Approved, get well soon.');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    expect(res.body.data.decidedBy).toBeTruthy();
    expect(res.body.data.decidedAt).toBeTruthy();
    expect(res.body.data.approverRemarks).toBe('Approved, get well soon.');

    // Reflects immediately in the parent's own view too.
    const mine = await asParent(parentTokenA).listMine();
    const found = mine.body.data.find((r) => r._id === created.body.data._id);
    expect(found.status).toBe('approved');
  });

  it('rejects deciding an already-decided request with 409', async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenA).create({
      leaveType: 'other', fromDate: '2025-10-01', toDate: '2025-10-01', reason: 'Personal matter',
    });
    await asStaff(classATeacherToken).reject(created.body.data._id, 'Not sufficient reason');
    const res = await asStaff(classATeacherToken).approve(created.body.data._id, 'changed my mind');
    expect(res.status).toBe(409);
  });

  it('principal can decide any student\'s request, unscoped', async () => {
    if (!dbAvailable) return;
    const created = await asParent(parentTokenB).create({
      leaveType: 'sick', fromDate: '2025-11-01', toDate: '2025-11-01', reason: 'Fever',
    });
    const res = await asStaff(principalToken).approve(created.body.data._id, 'OK');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });
});
