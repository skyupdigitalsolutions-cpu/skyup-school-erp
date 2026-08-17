'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class LeaveRequestRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.status) q.status = filters.status;
    if (filters.applicantType) q.applicantType = filters.applicantType;
    if (filters.leaveType) q.leaveType = filters.leaveType;
    if (filters.applicant) q.applicant = filters.applicant;
    return this.paginate(model, q, {
      ...pagination,
      sort: pagination.sort || { status: 1, appliedDate: -1 },
      populate: { path: 'applicant', select: 'employeeId personal.firstName personal.lastName' },
    });
  }

  async stats(model) {
    const [pending, approved, rejected, cancelled] = await Promise.all([
      model.countDocuments({ isDeleted: false, status: 'pending' }),
      model.countDocuments({ isDeleted: false, status: 'approved' }),
      model.countDocuments({ isDeleted: false, status: 'rejected' }),
      model.countDocuments({ isDeleted: false, status: 'cancelled' }),
    ]);
    return { pending, approved, rejected, cancelled, total: pending + approved + rejected + cancelled };
  }
}

module.exports = new LeaveRequestRepository();