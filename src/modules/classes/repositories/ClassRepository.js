'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class ClassRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.q) q.name = { $regex: filters.q, $options: 'i' };
    if (filters.academicYear) q.academicYear = filters.academicYear;
    if (filters.status) q.status = filters.status;
    return this.paginate(model, q, { ...pagination, populate: { path: 'classTeacher', select: 'personal.firstName personal.lastName' } });
  }

  async stats(model) {
    const [total, active] = await Promise.all([
      model.countDocuments({ isDeleted: false }),
      model.countDocuments({ isDeleted: false, status: 'active' }),
    ]);
    return { total, active, inactive: total - active };
  }
}

module.exports = new ClassRepository();