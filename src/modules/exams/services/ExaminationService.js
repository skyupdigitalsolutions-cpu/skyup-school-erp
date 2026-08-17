'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/ExaminationRepository');

class ExaminationService {
  _m(db) { return db.model('Examination'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async dashboardStats(db) { return repo.dashboardStats(this._m(db)); }

  async create(db, payload, actorId) {
    const exists = await repo.findOne(this._m(db), { examId: payload.examId });
    if (exists) throw ApiError.conflict(`Exam ID "${payload.examId}" already exists.`);
    return repo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const e = await repo.findById(this._m(db), id);
    if (!e) throw ApiError.notFound('Examination not found.');
    return e;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, payload, actorId);
  }

  async changeStatus(db, id, status, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, { status }, actorId);
  }

  async enterMarks(db, id, marksData, actorId) {
    await this.getById(db, id);
    return repo.bulkInsertMarks(this._m(db), id, marksData, actorId);
  }

  async publishResults(db, id, actorId) {
    await this.getById(db, id);
    return repo.publishResults(this._m(db), id, actorId);
  }

  async generateHallTickets(db, id, students, actorId) {
    await this.getById(db, id);
    return repo.generateHallTickets(this._m(db), id, students, actorId);
  }

  async addDocument(db, id, doc, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, { $push: { documents: doc } }, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Examination deleted.' };
  }
}

module.exports = new ExaminationService();
