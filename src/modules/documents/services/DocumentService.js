'use strict';
const ApiError = require('../../../core/ApiError');
const { getTeacherForUser } = require('../../../utils/teacherScope');

/**
 * Two distinct scopes, kept straight: teacher-owned docs (full CRUD, owner
 * only) vs. school-issued docs (read-only to teachers — created by
 * principal/admin outside this module, e.g. via seed/principal tooling).
 */
class DocumentService {
  _m(db) { return db.model('Document'); }

  async _getOwned(db, teacherId, documentId) {
    const doc = await this._m(db).findById(documentId).lean();
    if (!doc) throw ApiError.notFound('Document not found.');
    if (!teacherId || doc.ownerType !== 'teacher' || String(doc.owner) !== String(teacherId)) {
      throw ApiError.forbidden('You do not own this document.');
    }
    return doc;
  }

  /** GET /documents/mine?category= — this teacher's own uploads only. */
  async listMine(db, userId, { category }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const filter = { ownerType: 'teacher', owner: teacher._id };
    if (category) filter.category = category;

    return this._m(db).find(filter).sort({ createdAt: -1 }).lean();
  }

  /** GET /documents/shared?category= — school-issued docs visible to this teacher. Read-only. */
  async listShared(db, userId, { category }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const filter = {
      ownerType: 'school',
      $or: [{ issuedTo: { $size: 0 } }, { issuedTo: teacher._id }],
    };
    if (category) filter.category = category;

    return this._m(db).find(filter).sort({ createdAt: -1 }).lean();
  }

  /** POST /documents — teacher-owned only; category allow-list already enforced by Joi (personal|certificate). */
  async create(db, user, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    return this._m(db).create({
      ...payload,
      ownerType: 'teacher',
      owner: teacher._id,
      uploadedBy: user.id,
      createdBy: user.id,
      updatedBy: user.id,
    });
  }

  /** PATCH /documents/:id */
  async update(db, user, documentId, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwned(db, teacher?._id, documentId);

    return this._m(db)
      .findByIdAndUpdate(documentId, { $set: { ...payload, updatedBy: user.id } }, { new: true, runValidators: true })
      .lean();
  }

  /** DELETE /documents/:id */
  async remove(db, user, documentId) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwned(db, teacher?._id, documentId);

    await this._m(db).findByIdAndUpdate(documentId, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id },
    });
  }
}

module.exports = new DocumentService();
