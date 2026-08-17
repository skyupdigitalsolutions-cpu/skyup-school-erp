'use strict';

const ApiError = require('../../../core/ApiError');
const studentRepo = require('../repositories/StudentRepository');

/**
 * StudentService — orchestrates business logic for the Student Management
 * section of the Principal module. Controllers stay thin; all decisions live here.
 */
class StudentService {
  // ── Helpers ──────────────────────────────────────────────────────────────────
  _model(db) {
    return db.model('Student');
  }

  _activityModel(db) {
    return db.model('ActivityLog');
  }

  async _logActivity(db, entityId, action, description, meta = {}, actorId = null) {
    try {
      await this._activityModel(db).create({
        entityType: 'student',
        entityId,
        action,
        description,
        meta,
        performedBy: actorId,
      });
    } catch (_) {
      // Activity log failures must never break the primary operation.
    }
  }

  async _getOrFail(db, id) {
    const student = await studentRepo.findById(this._model(db), id);
    if (!student) throw ApiError.notFound('Student not found.');
    return student;
  }

  // ── Directory ─────────────────────────────────────────────────────────────
  async list(db, filters, pagination) {
    return studentRepo.search(this._model(db), filters, pagination);
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async create(db, payload, actorId) {
    const existing = await studentRepo.findOne(this._model(db), {
      admissionNo: payload.admissionNo,
    });
    if (existing) throw ApiError.conflict(`Admission number "${payload.admissionNo}" already exists.`);

    const student = await studentRepo.create(this._model(db), payload, actorId);
    await this._logActivity(db, student._id, 'created', 'Student profile created.', {}, actorId);
    return student;
  }

  // ── Read (single) ─────────────────────────────────────────────────────────
  async getById(db, id) {
    return this._getOrFail(db, id);
  }

  // ── Update sections ───────────────────────────────────────────────────────
  async update(db, id, payload, actorId) {
    await this._getOrFail(db, id);
    const updated = await studentRepo.updateById(this._model(db), id, payload, actorId);
    await this._logActivity(db, id, 'updated', 'Student profile updated.', {}, actorId);
    return updated;
  }

  // ── Status management ─────────────────────────────────────────────────────
  async changeStatus(db, id, status, actorId) {
    const student = await this._getOrFail(db, id);
    if (student.status === status) return student;
    const updated = await studentRepo.updateById(this._model(db), id, { status }, actorId);
    await this._logActivity(db, id, 'status_changed', `Status changed to ${status}.`, { from: student.status, to: status }, actorId);
    return updated;
  }

  // ── Archive / Soft-delete ─────────────────────────────────────────────────
  async archive(db, id, actorId) {
    await this._getOrFail(db, id);
    const archived = await studentRepo.updateById(this._model(db), id, { status: 'archived' }, actorId);
    await this._logActivity(db, id, 'archived', 'Student archived.', {}, actorId);
    return archived;
  }

  async delete(db, id, actorId) {
    await this._getOrFail(db, id);
    await studentRepo.softDeleteById(this._model(db), id, actorId);
    await this._logActivity(db, id, 'deleted', 'Student record deleted.', {}, actorId);
    return { message: 'Student deleted.' };
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  async bulkPromote(db, { ids, newClass, newSection, newAcademicYear }, actorId) {
    if (!ids?.length) throw ApiError.badRequest('No student IDs provided.');
    const result = await studentRepo.bulkPromote(
      this._model(db),
      ids,
      { newClass, newSection, newAcademicYear },
      actorId
    );
    return { modifiedCount: result.modifiedCount };
  }

  async bulkUpdateStatus(db, { ids, status }, actorId) {
    if (!ids?.length) throw ApiError.badRequest('No student IDs provided.');
    const result = await studentRepo.bulkUpdateStatus(this._model(db), ids, status, actorId);
    return { modifiedCount: result.modifiedCount };
  }

  // ── Section-level updates ─────────────────────────────────────────────────
  async addBehaviourNote(db, id, note, actorId) {
    await this._getOrFail(db, id);
    const updated = await studentRepo.addBehaviourNote(this._model(db), id, note, actorId);
    await this._logActivity(db, id, 'behaviour_note_added', 'Behaviour note recorded.', {}, actorId);
    return updated;
  }

  async addAward(db, id, award, actorId) {
    await this._getOrFail(db, id);
    const updated = await studentRepo.addAward(this._model(db), id, award, actorId);
    await this._logActivity(db, id, 'award_added', `Award "${award.title}" added.`, {}, actorId);
    return updated;
  }

  async addDocument(db, id, doc, actorId) {
    await this._getOrFail(db, id);
    const updated = await studentRepo.addDocument(this._model(db), id, doc, actorId);
    await this._logActivity(db, id, 'document_uploaded', `Document "${doc.name}" uploaded.`, {}, actorId);
    return updated;
  }

  async removeDocument(db, studentId, docId, actorId) {
    await this._getOrFail(db, studentId);
    const updated = await studentRepo.removeDocument(this._model(db), studentId, docId, actorId);
    await this._logActivity(db, studentId, 'document_removed', 'Document removed.', {}, actorId);
    return updated;
  }

  // ── Activity timeline ─────────────────────────────────────────────────────
  async getTimeline(db, id, { page = 1, limit = 20 } = {}) {
    await this._getOrFail(db, id);
    const skip = (page - 1) * limit;
    const logs = await this._activityModel(db)
      .find({ entityType: 'student', entityId: id })
      .sort({ performedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('performedBy', 'name email')
      .lean();
    return logs;
  }

  // ── Stats for principal dashboard ─────────────────────────────────────────
  async stats(db) {
    const m = this._model(db);
    const [total, active, byClass, byStatus] = await Promise.all([
      m.countDocuments(),
      m.countDocuments({ status: 'active' }),
      m.aggregate([
        { $match: { isDeleted: false, status: 'active' } },
        { $group: { _id: '$academic.class', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      m.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    return { total, active, byClass, byStatus };
  }
}

module.exports = new StudentService();
