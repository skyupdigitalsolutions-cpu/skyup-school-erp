'use strict';
const ApiError = require('../../../core/ApiError');
const { getOwnStudent } = require('../../../utils/studentScope');
const repo = require('../../attendance/repositories/AttendanceRepository');
const attendanceService = require('../../attendance/services/AttendanceService');

function toDateKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function toMonthKey(d) {
  return toDateKey(d).slice(0, 7);
}

/**
 * Read-only student/parent view of the existing Attendance records — no new
 * model, no marking. Reuses `AttendanceService.computeSummary` /
 * `percentageFromSummary` (holidays excluded from the denominator) and
 * `AttendanceRepository.forStudentRange` verbatim, so the numbers here can
 * never drift from the teacher-side attendance math.
 */
class StudentAttendanceService {
  _summaryWithPercentage(rows) {
    const summary = attendanceService.computeSummary(rows);
    return { ...summary, percentage: attendanceService.percentageFromSummary(summary) };
  }

  /** GET /student-attendance/me?from=&to= — the logged-in student's own attendance for a range. */
  async getMyAttendance(db, user, { from, to }) {
    const student = await getOwnStudent(db, user);
    if (!student) throw ApiError.notFound('No student profile linked to this account.');

    const rows = await repo.forStudentRange(db.model('Attendance'), {
      studentId: student._id,
      from: attendanceService.normalizeDate(from),
      to: attendanceService.normalizeDate(to),
    });

    const summary = this._summaryWithPercentage(rows);

    const days = rows
      .map((r) => ({ date: toDateKey(r.date), status: r.status, remarks: r.remarks || null }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const byMonth = new Map();
    rows.forEach((r) => {
      const key = toMonthKey(r.date);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(r);
    });
    const monthly = [...byMonth.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([month, monthRows]) => ({ month, ...this._summaryWithPercentage(monthRows) }));

    return { studentId: String(student._id), from, to, summary, days, monthly };
  }
}

module.exports = new StudentAttendanceService();
