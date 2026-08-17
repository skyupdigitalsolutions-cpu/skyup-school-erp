'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class SubjectRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.q) q.name = { $regex: filters.q, $options: 'i' };
    if (filters.grade) q.grades = filters.grade;
    if (filters.status) q.status = filters.status;
    return this.paginate(model, q, { ...pagination, sort: { name: 1 } });
  }
}

module.exports = new SubjectRepository();
