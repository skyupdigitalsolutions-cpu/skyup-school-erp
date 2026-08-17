'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/NoticeRepository');

class NoticeService {
  _m(db) { return db.model('Notice'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async stats(db) { return repo.stats(this._m(db)); }
  async latest(db, limit) { return repo.latest(this._m(db), limit); }

  async create(db, payload, actorId) {
    return repo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const n = await repo.findById(this._m(db), id);
    if (!n) throw ApiError.notFound('Notice not found.');
    return n;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, payload, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Notice deleted.' };
  }
}

module.exports = new NoticeService();