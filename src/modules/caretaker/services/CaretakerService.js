'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/CaretakerRepository');

class CaretakerService {
  _m(db) { return db.model('Caretaker'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async stats(db) { return repo.stats(this._m(db)); }

  async create(db, payload, actorId) {
    const exists = await repo.findOne(this._m(db), { caretakerId: payload.caretakerId });
    if (exists) throw ApiError.conflict(`Caretaker ID "${payload.caretakerId}" already exists.`);
    return repo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const c = await repo.findById(this._m(db), id);
    if (!c) throw ApiError.notFound('Caretaker not found.');
    return c;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, payload, actorId);
  }

  async changeStatus(db, id, status, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, { status }, actorId);
  }

  async verify(db, id, status, actorId) {
    await this.getById(db, id);
    return repo.updateVerification(this._m(db), id, status, actorId);
  }

  async assignStudents(db, id, students, actorId) {
    await this.getById(db, id);
    return repo.assignStudents(this._m(db), id, students, actorId);
  }

  async addDocument(db, id, doc, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, { $push: { documents: doc } }, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Caretaker deleted.' };
  }

  async bulkUpdateStatus(db, { ids, status }, actorId) {
    if (!ids?.length) throw ApiError.badRequest('No IDs provided.');
    const result = await this._m(db).updateMany({ _id: { $in: ids } }, { status, updatedBy: actorId });
    return { modifiedCount: result.modifiedCount };
  }
}

module.exports = new CaretakerService();
