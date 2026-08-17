'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class CaretakerRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.q) {
      q.$or = [
        { caretakerId: { $regex: filters.q, $options: 'i' } },
        { 'personal.firstName': { $regex: filters.q, $options: 'i' } },
        { 'personal.lastName': { $regex: filters.q, $options: 'i' } },
        { 'personal.phone': { $regex: filters.q, $options: 'i' } },
        { 'vehicleDetails.vehicleNumber': { $regex: filters.q, $options: 'i' } },
      ];
    }
    if (filters.status) q.status = filters.status;
    if (filters.verificationStatus) q.verificationStatus = filters.verificationStatus;
    if (filters.employmentType) q.employmentType = filters.employmentType;
    if (filters.relationship) q['personal.relationship'] = filters.relationship;
    if (filters.vehicleAssigned === 'yes') q['vehicleDetails.vehicleNumber'] = { $exists: true, $ne: null };
    if (filters.studentAssigned === 'yes') q['assignedStudents.0'] = { $exists: true };
    return this.paginate(model, q, pagination);
  }

  async stats(model) {
    const [total, active, verified, pending] = await Promise.all([
      model.countDocuments({ isDeleted: false }),
      model.countDocuments({ isDeleted: false, status: 'active' }),
      model.countDocuments({ isDeleted: false, verificationStatus: 'verified' }),
      model.countDocuments({ isDeleted: false, verificationStatus: 'pending' }),
    ]);
    return { total, active, inactive: total - active, verified, pending };
  }

  async assignStudents(model, id, students, actorId) {
    return model.findByIdAndUpdate(id, { assignedStudents: students, updatedBy: actorId }, { new: true });
  }

  async updateVerification(model, id, status, actorId) {
    return model.findByIdAndUpdate(id, { verificationStatus: status, updatedBy: actorId }, { new: true });
  }
}

module.exports = new CaretakerRepository();
