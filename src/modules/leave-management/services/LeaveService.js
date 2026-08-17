'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/LeaveRequestRepository');

const APPLICANT_MODEL = { teacher: 'Teacher', caretaker: 'Caretaker' };

class LeaveService {
  _m(db) { return db.model('LeaveRequest'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async stats(db) { return repo.stats(this._m(db)); }

  async create(db, payload, actorId) {
    const applicantModel = APPLICANT_MODEL[payload.applicantType];
    if (!applicantModel) throw ApiError.badRequest('applicantType must be "teacher" or "caretaker".');

    const from = new Date(payload.fromDate);
    const to = new Date(payload.toDate);
    if (to < from) throw ApiError.badRequest('toDate cannot be before fromDate.');
    const totalDays = payload.totalDays || Math.round((to - from) / 86400000) + 1;

    return repo.create(this._m(db), { ...payload, applicantModel, totalDays }, actorId);
  }

  async getById(db, id) {
    const l = await repo.findById(this._m(db), id, { populate: { path: 'applicant', select: 'employeeId caretakerId personal.firstName personal.lastName' } });
    if (!l) throw ApiError.notFound('Leave request not found.');
    return l;
  }

  async decide(db, id, status, remarks, actorId) {
    const leave = await this.getById(db, id);
    if (leave.status !== 'pending') throw ApiError.conflict(`This request is already ${leave.status}.`);
    return repo.updateById(this._m(db), id, {
      status,
      approverRemarks: remarks || null,
      decidedBy: actorId,
      decidedAt: new Date(),
    }, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Leave request deleted.' };
  }
}

module.exports = new LeaveService();