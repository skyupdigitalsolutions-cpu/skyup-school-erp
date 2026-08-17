'use strict';

const ApiError = require('../../../core/ApiError');
const teacherRepo = require('../repositories/TeacherRepository');

/**
 * TeacherService — business logic for the Teacher Management section of the
 * Principal module.
 */
class TeacherService {
  _model(db) {
    return db.model('Teacher');
  }

  _activityModel(db) {
    return db.model('ActivityLog');
  }

  async _logActivity(db, entityId, action, description, meta = {}, actorId = null) {
    try {
      await this._activityModel(db).create({
        entityType: 'teacher',
        entityId,
        action,
        description,
        meta,
        performedBy: actorId,
      });
    } catch (_) { /* non-critical */ }
  }

  async _getOrFail(db, id) {
    const teacher = await teacherRepo.findById(this._model(db), id);
    if (!teacher) throw ApiError.notFound('Teacher not found.');
    return teacher;
  }

  // ── Directory ─────────────────────────────────────────────────────────────
  async list(db, filters, pagination) {
    return teacherRepo.search(this._model(db), filters, pagination);
  }

  // ── Dashboard stats ───────────────────────────────────────────────────────
  async dashboardStats(db) {
    const m = this._model(db);
    const [total, active, departmentStats, byStatus] = await Promise.all([
      m.countDocuments(),
      m.countDocuments({ status: 'active' }),
      teacherRepo.departmentStats(m),
      m.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    ]);
    return { total, active, departmentStats, byStatus };
  }

  // ── Create ────────────────────────────────────────────────────────────────
  async create(db, payload, actorId) {
    const existing = await teacherRepo.findOne(this._model(db), {
      employeeId: payload.employeeId,
    });
    if (existing) throw ApiError.conflict(`Employee ID "${payload.employeeId}" already exists.`);

    const emailExists = await teacherRepo.findOne(this._model(db), {
      'personal.email': payload.personal?.email,
    });
    if (emailExists) throw ApiError.conflict('A teacher with this email already exists.');

    const teacher = await teacherRepo.create(this._model(db), payload, actorId);
    await this._logActivity(db, teacher._id, 'created', 'Teacher profile created.', {}, actorId);
    return teacher;
  }

  // ── Read ──────────────────────────────────────────────────────────────────
  async getById(db, id) {
    return this._getOrFail(db, id);
  }

  // ── Update ────────────────────────────────────────────────────────────────
  async update(db, id, payload, actorId) {
    await this._getOrFail(db, id);
    const updated = await teacherRepo.updateById(this._model(db), id, payload, actorId);
    await this._logActivity(db, id, 'updated', 'Teacher profile updated.', {}, actorId);
    return updated;
  }

  // ── Status management ─────────────────────────────────────────────────────
  async changeStatus(db, id, status, actorId) {
    const teacher = await this._getOrFail(db, id);
    if (teacher.status === status) return teacher;
    const updated = await teacherRepo.updateById(this._model(db), id, { status }, actorId);
    await this._logActivity(db, id, 'status_changed', `Status changed to ${status}.`, { from: teacher.status, to: status }, actorId);
    return updated;
  }

  async archive(db, id, actorId) {
    await this._getOrFail(db, id);
    const archived = await teacherRepo.updateById(this._model(db), id, { status: 'archived' }, actorId);
    await this._logActivity(db, id, 'archived', 'Teacher archived.', {}, actorId);
    return archived;
  }

  async delete(db, id, actorId) {
    await this._getOrFail(db, id);
    await teacherRepo.softDeleteById(this._model(db), id, actorId);
    await this._logActivity(db, id, 'deleted', 'Teacher record deleted.', {}, actorId);
    return { message: 'Teacher deleted.' };
  }

  // ── Subject assignment ────────────────────────────────────────────────────
  async assignSubjects(db, id, subjects, actorId) {
    await this._getOrFail(db, id);
    const updated = await teacherRepo.assignSubjects(this._model(db), id, subjects, actorId);
    await this._logActivity(db, id, 'subjects_assigned', 'Subjects/classes assigned.', {}, actorId);
    return updated;
  }

  // ── Performance review ────────────────────────────────────────────────────
  async addPerformanceReview(db, id, review, actorId) {
    await this._getOrFail(db, id);
    const updated = await teacherRepo.addPerformanceReview(this._model(db), id, review, actorId);
    await this._logActivity(db, id, 'performance_reviewed', `Performance review added (rating ${review.rating}).`, {}, actorId);
    return updated;
  }

  // ── Documents ─────────────────────────────────────────────────────────────
  async addDocument(db, id, doc, actorId) {
    await this._getOrFail(db, id);
    const updated = await teacherRepo.addDocument(this._model(db), id, doc, actorId);
    await this._logActivity(db, id, 'document_uploaded', `Document "${doc.name}" uploaded.`, {}, actorId);
    return updated;
  }

  async removeDocument(db, teacherId, docId, actorId) {
    await this._getOrFail(db, teacherId);
    const updated = await teacherRepo.removeDocument(this._model(db), teacherId, docId, actorId);
    await this._logActivity(db, teacherId, 'document_removed', 'Document removed.', {}, actorId);
    return updated;
  }

  // ── Assets ────────────────────────────────────────────────────────────────
  async assignAsset(db, id, asset, actorId) {
    await this._getOrFail(db, id);
    const updated = await teacherRepo.assignAsset(this._model(db), id, asset, actorId);
    await this._logActivity(db, id, 'asset_assigned', `Asset "${asset.assetName}" assigned.`, {}, actorId);
    return updated;
  }

  // ── AI Insights ───────────────────────────────────────────────────────────
  async updateAiInsights(db, id, insights, actorId) {
    await this._getOrFail(db, id);
    return teacherRepo.updateAiInsights(this._model(db), id, insights, actorId);
  }

  // ── Bulk actions ──────────────────────────────────────────────────────────
  async bulkUpdateStatus(db, { ids, status }, actorId) {
    if (!ids?.length) throw ApiError.badRequest('No teacher IDs provided.');
    const result = await teacherRepo.bulkUpdateStatus(this._model(db), ids, status, actorId);
    return { modifiedCount: result.modifiedCount };
  }

  // ── Activity timeline ─────────────────────────────────────────────────────
  async getTimeline(db, id, { page = 1, limit = 20 } = {}) {
    await this._getOrFail(db, id);
    const skip = (page - 1) * limit;
    return this._activityModel(db)
      .find({ entityType: 'teacher', entityId: id })
      .sort({ performedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('performedBy', 'name email')
      .lean();
  }
}

module.exports = new TeacherService();
