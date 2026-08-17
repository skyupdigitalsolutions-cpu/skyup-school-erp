'use strict';
const BaseRepository = require('../../../core/BaseRepository');

/** Numeric-aware compare — Student.rollNo is a free-text string field. */
function byRollNo(a, b) {
  const na = Number(a.rollNo);
  const nb = Number(b.rollNo);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return String(a.rollNo || '').localeCompare(String(b.rollNo || ''));
}

class AttendanceRepository extends BaseRepository {
  /** The active student roster for a class+section, sorted by rollNo. */
  async roster(studentModel, { className, section, academicYear }) {
    const students = await studentModel
      .find({
        'academic.class': className,
        'academic.section': section,
        'academic.academicYear': academicYear,
        status: 'active',
      })
      .lean();
    return students.sort(byRollNo);
  }

  async forClassSectionDate(model, { classId, section, date }) {
    return model.find({ class: classId, section, date }).lean();
  }

  async upsertOne(model, { classId, section, student, date, period }, { status, remarks, academicYear }, actorId) {
    return model.findOneAndUpdate(
      { class: classId, section, student, date, period: period ?? null },
      {
        $set: { status, remarks: remarks ?? null, markedBy: actorId, updatedBy: actorId, academicYear },
        $setOnInsert: { createdBy: actorId },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  async forStudentRange(model, { studentId, from, to }) {
    return model.find({ student: studentId, date: { $gte: from, $lte: to } }).lean();
  }
}

module.exports = new AttendanceRepository();
