'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class FeeReminderRepository extends BaseRepository {
  /** GET /finance/reminders?student= — optionally scoped to one student's history, otherwise all reminders. */
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.student) q.student = filters.student;
    return this.paginate(model, q, {
      ...pagination,
      populate: { path: 'student', select: 'admissionNo personal.firstName personal.lastName academic.class academic.section' },
    });
  }
}

module.exports = new FeeReminderRepository();
