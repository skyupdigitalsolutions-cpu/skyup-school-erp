'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/ClassRepository');

class ClassService {
  _m(db) { return db.model('Class'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async stats(db) { return repo.stats(this._m(db)); }

  async create(db, payload, actorId) {
    const exists = await repo.findOne(this._m(db), { name: payload.name, academicYear: payload.academicYear });
    if (exists) throw ApiError.conflict(`Class "${payload.name}" already exists for ${payload.academicYear}.`);
    return repo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const c = await repo.findById(this._m(db), id, { populate: { path: 'classTeacher', select: 'personal.firstName personal.lastName' } });
    if (!c) throw ApiError.notFound('Class not found.');
    return c;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, payload, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Class deleted.' };
  }
}

module.exports = new ClassService();