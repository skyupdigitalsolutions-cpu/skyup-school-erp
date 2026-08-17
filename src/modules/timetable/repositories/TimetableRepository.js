'use strict';
const BaseRepository = require('../../../core/BaseRepository');

const POPULATE = [
  { path: 'subject', select: 'name code' },
  { path: 'staff', select: 'employeeId personal.firstName personal.lastName' },
  { path: 'class', select: 'name sections academicYear' },
];

class TimetableRepository extends BaseRepository {
  async forStaff(model, staffId) {
    return model.find({ staff: staffId }).sort({ dayOfWeek: 1, period: 1 }).populate(POPULATE).lean();
  }

  async forClassSection(model, { academicYear, classId, section }) {
    const q = { class: classId, section };
    if (academicYear) q.academicYear = academicYear;
    return model.find(q).sort({ dayOfWeek: 1, period: 1 }).populate(POPULATE).lean();
  }

  async findSlot(model, { academicYear, classId, section, dayOfWeek, period }) {
    return model.findOne({ academicYear, class: classId, section, dayOfWeek, period }).lean();
  }
}

module.exports = new TimetableRepository();
