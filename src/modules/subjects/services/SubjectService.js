'use strict';
const ApiError = require('../../../core/ApiError');
const subjectRepo = require('../repositories/SubjectRepository');
const topicRepo = require('../repositories/SyllabusTopicRepository');
const { buildTopicTree } = require('./topicTree');

class SubjectService {
  _m(db) { return db.model('Subject'); }
  _topicModel(db) { return db.model('SyllabusTopic'); }

  async list(db, filters, pagination) {
    return subjectRepo.search(this._m(db), filters, pagination);
  }

  async create(db, payload, actorId) {
    const exists = await subjectRepo.findOne(this._m(db), { code: payload.code.toUpperCase() });
    if (exists) throw ApiError.conflict(`Subject code "${payload.code}" already exists.`);
    return subjectRepo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const subject = await subjectRepo.findById(this._m(db), id);
    if (!subject) throw ApiError.notFound('Subject not found.');
    return subject;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    return subjectRepo.updateById(this._m(db), id, payload, actorId);
  }

  async archive(db, id, actorId) {
    await this.getById(db, id);
    return subjectRepo.updateById(this._m(db), id, { status: 'inactive' }, actorId);
  }

  // ── Syllabus topics ────────────────────────────────────────────────────────

  async getTopicTree(db, subjectId, { grade, academicYear }) {
    await this.getById(db, subjectId);
    if (!grade) throw ApiError.badRequest('grade is required.');
    const flat = await topicRepo.listBySubjectGrade(this._topicModel(db), {
      subject: subjectId,
      grade,
      academicYear,
    });
    return buildTopicTree(flat);
  }

  async createTopic(db, subjectId, payload, actorId) {
    await this.getById(db, subjectId);
    if (payload.parent) {
      const parent = await topicRepo.findById(this._topicModel(db), payload.parent);
      if (!parent) throw ApiError.badRequest('Parent topic not found.');
      if (String(parent.subject) !== String(subjectId)) {
        throw ApiError.badRequest('Parent topic belongs to a different subject.');
      }
    }
    return topicRepo.create(this._topicModel(db), { ...payload, subject: subjectId }, actorId);
  }

  async _getTopicOrFail(db, subjectId, topicId) {
    const topic = await topicRepo.findById(this._topicModel(db), topicId);
    if (!topic || String(topic.subject) !== String(subjectId)) {
      throw ApiError.notFound('Syllabus topic not found.');
    }
    return topic;
  }

  async updateTopic(db, subjectId, topicId, payload, actorId) {
    await this._getTopicOrFail(db, subjectId, topicId);
    return topicRepo.updateById(this._topicModel(db), topicId, payload, actorId);
  }

  async archiveTopic(db, subjectId, topicId, actorId) {
    await this._getTopicOrFail(db, subjectId, topicId);
    await topicRepo.softDeleteById(this._topicModel(db), topicId, actorId);
    return { message: 'Syllabus topic archived.' };
  }
}

module.exports = new SubjectService();
