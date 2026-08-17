'use strict';

const BaseRepository = require('../../../core/BaseRepository');

/**
 * StudentRepository — data-access layer for the Student model.
 * All methods receive the tenant-bound model from req.db so the repo itself
 * holds no connection reference and can be instantiated as a singleton.
 */
class StudentRepository extends BaseRepository {
  /**
   * Full-text + field search with pagination and optional filters.
   * @param {import('mongoose').Model} model
   * @param {object} filters - from the request query (already sanitised by validation)
   * @param {object} pagination - { page, limit, sort }
   */
  async search(model, filters = {}, pagination = {}) {
    const query = this._buildSearchQuery(filters);
    return this.paginate(model, query, pagination);
  }

  _buildSearchQuery(filters) {
    const q = {};

    if (filters.q) {
      // Prefer text index if enabled, fall back to regex.
      q.$or = [
        { admissionNo: { $regex: filters.q, $options: 'i' } },
        { 'personal.firstName': { $regex: filters.q, $options: 'i' } },
        { 'personal.lastName': { $regex: filters.q, $options: 'i' } },
      ];
    }

    if (filters.academicYear) q['academic.academicYear'] = filters.academicYear;
    if (filters.class) q['academic.class'] = filters.class;
    if (filters.section) q['academic.section'] = filters.section;
    if (filters.house) q['academic.house'] = filters.house;
    if (filters.status) q.status = filters.status;
    if (filters.gender) q['personal.gender'] = filters.gender;

    if (filters.transport === 'yes') q['transport.enrolled'] = true;
    if (filters.transport === 'no') q['transport.enrolled'] = false;

    if (filters.hostel === 'yes') q['hostel.enrolled'] = true;
    if (filters.hostel === 'no') q['hostel.enrolled'] = false;

    if (filters.medicalAlert === 'yes') {
      q.$or = [...(q.$or || []), { 'medical.conditions.0': { $exists: true } }];
    }

    if (filters.feeStatus) q['feeStatus.status'] = filters.feeStatus;

    if (filters.admissionFrom || filters.admissionTo) {
      q['academic.admissionDate'] = {};
      if (filters.admissionFrom) q['academic.admissionDate'].$gte = new Date(filters.admissionFrom);
      if (filters.admissionTo) q['academic.admissionDate'].$lte = new Date(filters.admissionTo);
    }

    if (filters.attendanceBelow) {
      q['attendanceSummary.percentage'] = { $lt: Number(filters.attendanceBelow) };
    }

    return q;
  }

  /**
   * Bulk-update status for multiple students.
   * @param {import('mongoose').Model} model
   * @param {string[]} ids
   * @param {string} status
   * @param {string|null} actorId
   */
  async bulkUpdateStatus(model, ids, status, actorId = null) {
    return model.updateMany(
      { _id: { $in: ids } },
      { status, updatedBy: actorId }
    );
  }

  /**
   * Promote students to the next class/section.
   */
  async bulkPromote(model, ids, { newClass, newSection, newAcademicYear }, actorId = null) {
    return model.updateMany(
      { _id: { $in: ids } },
      {
        'academic.class': newClass,
        'academic.section': newSection,
        'academic.academicYear': newAcademicYear,
        updatedBy: actorId,
      }
    );
  }

  /**
   * Append a behaviour note to a student document.
   */
  async addBehaviourNote(model, id, note, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      {
        $push: { behaviourNotes: { ...note, recordedBy: actorId } },
        updatedBy: actorId,
      },
      { new: true }
    );
  }

  /**
   * Append an award to a student document.
   */
  async addAward(model, id, award, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      { $push: { awards: award }, updatedBy: actorId },
      { new: true }
    );
  }

  /**
   * Append an uploaded document reference.
   */
  async addDocument(model, id, doc, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      { $push: { documents: doc }, updatedBy: actorId },
      { new: true }
    );
  }

  /**
   * Pull a document by its sub-document _id.
   */
  async removeDocument(model, studentId, docId, actorId = null) {
    return model.findByIdAndUpdate(
      studentId,
      { $pull: { documents: { _id: docId } }, updatedBy: actorId },
      { new: true }
    );
  }
}

module.exports = new StudentRepository();
