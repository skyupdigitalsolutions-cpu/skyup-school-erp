'use strict';
const { getOwnStudent } = require('../../../utils/studentScope');
const repo = require('../../timetable/repositories/TimetableRepository');
const timetableService = require('../../timetable/services/TimetableService');

/**
 * Read-only student/parent view of the existing weekly TimetableEntry rows —
 * no new model. Scoped to the logged-in student's OWN class+section (never a
 * client-supplied one), and reuses `TimetableRepository.forClassSection` +
 * `TimetableService.groupByDay` verbatim — the exact same query/grouping the
 * teacher's "class timetable" endpoint uses.
 */
class StudentTimetableService {
  _empty(student) {
    return {
      academicYear: student?.academic?.academicYear || null,
      className: student?.academic?.class || null,
      section: student?.academic?.section || null,
      days: timetableService.groupByDay([]),
    };
  }

  /** GET /student-timetable/me */
  async getMyTimetable(db, user) {
    const student = await getOwnStudent(db, user);
    if (!student) return this._empty(null);

    const klass = await db
      .model('Class')
      .findOne({ name: student.academic.class, academicYear: student.academic.academicYear })
      .lean();
    // No matching Class doc yet (e.g. mid-setup) — an empty timetable, not an error.
    if (!klass) return this._empty(student);

    const entries = await repo.forClassSection(db.model('TimetableEntry'), {
      academicYear: student.academic.academicYear,
      classId: klass._id,
      section: student.academic.section,
    });

    return {
      academicYear: student.academic.academicYear,
      className: klass.name,
      section: student.academic.section,
      days: timetableService.groupByDay(entries),
    };
  }
}

module.exports = new StudentTimetableService();
