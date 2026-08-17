'use strict';

const BaseRepository = require('../../../core/BaseRepository');

/**
 * TeacherRepository — data-access layer for the Teacher model.
 */
class TeacherRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const query = this._buildSearchQuery(filters);
    return this.paginate(model, query, pagination);
  }

  _buildSearchQuery(filters) {
    const q = {};

    if (filters.q) {
      q.$or = [
        { employeeId: { $regex: filters.q, $options: 'i' } },
        { 'personal.firstName': { $regex: filters.q, $options: 'i' } },
        { 'personal.lastName': { $regex: filters.q, $options: 'i' } },
        { 'personal.email': { $regex: filters.q, $options: 'i' } },
      ];
    }

    if (filters.department) q['professional.department'] = filters.department;
    if (filters.designation) q['professional.designation'] = filters.designation;
    if (filters.employmentType) q['professional.employmentType'] = filters.employmentType;
    if (filters.status) q.status = filters.status;
    if (filters.subject) q['assignedSubjects.subject'] = filters.subject;
    if (filters.class) q['assignedSubjects.class'] = filters.class;
    if (filters.academicYear) q['assignedSubjects.academicYear'] = filters.academicYear;

    if (filters.joiningFrom || filters.joiningTo) {
      q['professional.joiningDate'] = {};
      if (filters.joiningFrom) q['professional.joiningDate'].$gte = new Date(filters.joiningFrom);
      if (filters.joiningTo) q['professional.joiningDate'].$lte = new Date(filters.joiningTo);
    }

    if (filters.experienceMin || filters.experienceMax) {
      q['professional.experienceYears'] = {};
      if (filters.experienceMin) q['professional.experienceYears'].$gte = Number(filters.experienceMin);
      if (filters.experienceMax) q['professional.experienceYears'].$lte = Number(filters.experienceMax);
    }

    if (filters.attendanceBelow) {
      q['attendanceSummary.percentage'] = { $lt: Number(filters.attendanceBelow) };
    }

    if (filters.performanceAbove) {
      q['performance.lastRating'] = { $gte: Number(filters.performanceAbove) };
    }

    return q;
  }

  async bulkUpdateStatus(model, ids, status, actorId = null) {
    return model.updateMany(
      { _id: { $in: ids } },
      { status, updatedBy: actorId }
    );
  }

  async assignSubjects(model, id, subjects, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      { assignedSubjects: subjects, updatedBy: actorId },
      { new: true, runValidators: true }
    );
  }

  async addPerformanceReview(model, id, review, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      {
        $push: { 'performance.reviews': { ...review, reviewedBy: actorId } },
        'performance.lastRating': review.rating,
        'performance.lastReviewDate': new Date(),
        updatedBy: actorId,
      },
      { new: true }
    );
  }

  async addDocument(model, id, doc, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      { $push: { documents: doc }, updatedBy: actorId },
      { new: true }
    );
  }

  async removeDocument(model, teacherId, docId, actorId = null) {
    return model.findByIdAndUpdate(
      teacherId,
      { $pull: { documents: { _id: docId } }, updatedBy: actorId },
      { new: true }
    );
  }

  async assignAsset(model, id, asset, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      { $push: { assets: asset }, updatedBy: actorId },
      { new: true }
    );
  }

  async updateAiInsights(model, id, insights, actorId = null) {
    return model.findByIdAndUpdate(
      id,
      { aiInsights: { ...insights, generatedAt: new Date() }, updatedBy: actorId },
      { new: true }
    );
  }

  /**
   * Department-level analytics for the Teacher Dashboard.
   */
  async departmentStats(model) {
    return model.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: '$professional.department',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          avgRating: { $avg: '$performance.lastRating' },
          avgAttendance: { $avg: '$attendanceSummary.percentage' },
        },
      },
      { $sort: { total: -1 } },
    ]);
  }
}

module.exports = new TeacherRepository();
