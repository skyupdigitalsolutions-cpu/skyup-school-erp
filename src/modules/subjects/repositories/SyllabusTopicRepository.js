'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class SyllabusTopicRepository extends BaseRepository {
  async listBySubjectGrade(model, { subject, grade, academicYear }) {
    const q = { subject, grade };
    if (academicYear) q.academicYear = academicYear;
    return model.find(q).sort({ sequence: 1, title: 1 }).lean();
  }
}

module.exports = new SyllabusTopicRepository();
