'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/EventRepository');

class EventService {
  _m(db) { return db.model('Event'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async dashboardStats(db) { return repo.dashboardStats(this._m(db)); }

  async create(db, payload, actorId) {
    const exists = await repo.findOne(this._m(db), { eventId: payload.eventId });
    if (exists) throw ApiError.conflict(`Event ID "${payload.eventId}" already exists.`);
    return repo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const e = await repo.findById(this._m(db), id);
    if (!e) throw ApiError.notFound('Event not found.');
    return e;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, payload, actorId);
  }

  async changeStatus(db, id, status, actorId) {
    await this.getById(db, id);
    return repo.updateStatus(this._m(db), id, status, actorId);
  }

  async addFeedback(db, id, feedback) {
    await this.getById(db, id);
    return repo.addFeedback(this._m(db), id, feedback);
  }

  async addDocument(db, id, doc, actorId) {
    await this.getById(db, id);
    return repo.updateById(this._m(db), id, { $push: { documents: doc } }, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Event deleted.' };
  }

  async bulkCancel(db, { ids }, actorId) {
    if (!ids?.length) throw ApiError.badRequest('No IDs provided.');
    const result = await this._m(db).updateMany({ _id: { $in: ids } }, { status: 'cancelled', updatedBy: actorId });
    return { modifiedCount: result.modifiedCount };
  }
}

module.exports = new EventService();
