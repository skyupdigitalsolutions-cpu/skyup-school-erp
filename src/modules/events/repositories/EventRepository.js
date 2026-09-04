'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class EventRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.q) {
      q.$or = [
        { eventId: { $regex: filters.q, $options: 'i' } },
        { name: { $regex: filters.q, $options: 'i' } },
        { 'organizer.name': { $regex: filters.q, $options: 'i' } },
        { 'venue.hall': { $regex: filters.q, $options: 'i' } },
      ];
    }
    if (filters.status) q.status = filters.status;
    if (filters.category) q.category = filters.category;
    if (filters.academicYear) q.academicYear = filters.academicYear;
    if (filters.department) q['organizer.department'] = filters.department;
    if (filters.dateFrom || filters.dateTo) {
      q['schedule.startDate'] = {};
      if (filters.dateFrom) q['schedule.startDate'].$gte = new Date(filters.dateFrom);
      if (filters.dateTo) q['schedule.startDate'].$lte = new Date(filters.dateTo);
    }
    return this.paginate(model, q, pagination);
  }

  async dashboardStats(model) {
    const now = new Date();
    const [total, upcoming, ongoing, completed, cancelled] = await Promise.all([
      model.countDocuments({ isDeleted: false }),
      model.countDocuments({ isDeleted: false, 'schedule.startDate': { $gt: now }, status: { $in: ['approved','pending_approval'] } }),
      model.countDocuments({ isDeleted: false, status: 'ongoing' }),
      model.countDocuments({ isDeleted: false, status: 'completed' }),
      model.countDocuments({ isDeleted: false, status: 'cancelled' }),
    ]);
    return { total, upcoming, ongoing, completed, cancelled, pendingApprovals: await model.countDocuments({ isDeleted: false, status: 'pending_approval' }) };
  }

  async updateStatus(model, id, status, actorId, notes) {
    const set = { status, updatedBy: actorId };
    if (status === 'pending_approval') {
      set['approval.requestedBy'] = actorId;
      set['approval.requestedAt'] = new Date();
      set['approval.approvedBy'] = null;
      set['approval.approvedAt'] = null;
    }
    if (status === 'approved') {
      set['approval.approvedBy'] = actorId;
      set['approval.approvedAt'] = new Date();
      if (notes) set['approval.notes'] = notes;
    }
    // Rejection is modeled as sending it back to draft with the reason recorded.
    if (status === 'draft' && notes) set['approval.notes'] = notes;

    return model
      .findByIdAndUpdate(id, set, { new: true })
      .populate('approval.requestedBy approval.approvedBy', 'name email');
  }

  async addFeedback(model, id, feedback) {
    const event = await model.findById(id);
    if (!event) return null;
    event.feedback.responses.push(feedback);
    event.feedback.totalResponses = event.feedback.responses.length;
    event.feedback.averageRating = event.feedback.responses.reduce((s, r) => s + r.rating, 0) / event.feedback.responses.length;
    return event.save();
  }
}

module.exports = new EventRepository();
