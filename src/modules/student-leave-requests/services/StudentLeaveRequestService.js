'use strict';
const ApiError = require('../../../core/ApiError');
const { getOwnStudent } = require('../../../utils/studentScope');
const { getTeacherForUser, findMyClass } = require('../../../utils/teacherScope');
const { ROLES } = require('../../../utils/constants');

class StudentLeaveRequestService {
  _m(db) { return db.model('StudentLeaveRequest'); }

  // ── Parent/student side ──────────────────────────────────────────────────

  /** POST /student-leave-requests — the logged-in student's OWN leave request only. */
  async create(db, user, payload) {
    const student = await getOwnStudent(db, user);
    if (!student) throw ApiError.notFound('No student profile linked to this account.');

    const from = new Date(payload.fromDate);
    const to = new Date(payload.toDate);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw ApiError.badRequest('Invalid fromDate/toDate.');
    if (to < from) throw ApiError.badRequest('toDate cannot be before fromDate.');
    if (!payload.reason || !payload.reason.trim()) throw ApiError.badRequest('reason is required.');

    const totalDays = Math.round((to - from) / 86400000) + 1;

    return this._m(db).create({
      student: student._id,
      requestedBy: user.id,
      leaveType: payload.leaveType,
      fromDate: from,
      toDate: to,
      totalDays,
      reason: payload.reason.trim(),
      status: 'pending',
      createdBy: user.id,
      updatedBy: user.id,
    });
  }

  /** GET /student-leave-requests/me — the logged-in student's own requests, newest first. */
  async listMine(db, user) {
    const student = await getOwnStudent(db, user);
    if (!student) return [];
    return this._m(db).find({ student: student._id }).sort({ fromDate: -1, createdAt: -1 }).lean();
  }

  /** Resolves a request AND proves it belongs to the logged-in student — 404 otherwise, never leaking another student's request. */
  async _getOwnRequest(db, user, id) {
    const student = await getOwnStudent(db, user);
    if (!student) throw ApiError.notFound('Leave request not found.');

    const request = await this._m(db).findById(id);
    if (!request || String(request.student) !== String(student._id)) {
      throw ApiError.notFound('Leave request not found.');
    }
    return request;
  }

  /** POST /student-leave-requests/:id/cancel — own request only, and only while still pending. */
  async cancelMine(db, user, id) {
    const request = await this._getOwnRequest(db, user, id);
    if (request.status !== 'pending') {
      throw ApiError.conflict(`This request is already ${request.status} and can no longer be cancelled.`);
    }
    request.status = 'cancelled';
    request.updatedBy = user.id;
    await request.save();
    return request;
  }

  // ── Staff side ────────────────────────────────────────────────────────────

  /**
   * Resolve which student ids a staff member may act on: unrestricted for
   * principal/administrator (mirrors `assertClassTeacherAccess`'s own
   * bypass), or exactly the roster of the ONE class this teacher is class
   * teacher of. Returns `null` for "no restriction", or an array (possibly
   * empty) of student ids otherwise.
   */
  async _scopedStudentIds(db, user) {
    if (user.roles.includes(ROLES.PRINCIPAL) || user.roles.includes(ROLES.ADMINISTRATOR)) return null;

    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    const klass = await findMyClass(db, teacher._id);
    if (!klass) throw ApiError.forbidden('You are not the class teacher of any class.');

    const students = await db
      .model('Student')
      .find({ 'academic.class': klass.name, 'academic.academicYear': klass.academicYear })
      .select('_id')
      .lean();
    return students.map((s) => s._id);
  }

  /** GET /student-leave-requests/staff?status= — scoped to the staff member's own class (unscoped for principal/admin). */
  async listForStaff(db, user, { status } = {}) {
    const studentIds = await this._scopedStudentIds(db, user);
    const filter = {};
    if (status) filter.status = status;
    if (studentIds !== null) filter.student = { $in: studentIds };

    return this._m(db)
      .find(filter)
      .sort({ status: 1, fromDate: -1 })
      .populate({ path: 'student', select: 'personal.firstName personal.lastName admissionNo rollNo academic.class academic.section' })
      .lean();
  }

  /** Resolves a request AND proves the staff member is in-scope for its student — 404 otherwise. */
  async _getRequestForStaff(db, user, id) {
    const request = await this._m(db).findById(id);
    if (!request) throw ApiError.notFound('Leave request not found.');

    const studentIds = await this._scopedStudentIds(db, user);
    if (studentIds !== null && !studentIds.some((sid) => String(sid) === String(request.student))) {
      throw ApiError.notFound('Leave request not found.');
    }
    return request;
  }

  /** POST /student-leave-requests/staff/:id/approve|reject — mirrors LeaveService.decide()'s exact semantics. */
  async decide(db, user, id, status, remarks) {
    const request = await this._getRequestForStaff(db, user, id);
    if (request.status !== 'pending') throw ApiError.conflict(`This request is already ${request.status}.`);

    request.status = status;
    request.approverRemarks = remarks || null;
    request.decidedBy = user.id;
    request.decidedAt = new Date();
    request.updatedBy = user.id;
    await request.save();
    return request;
  }
}

module.exports = new StudentLeaveRequestService();
