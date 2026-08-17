'use strict';
const attendanceRepo = require('../../attendance/repositories/AttendanceRepository');
const syllabusService = require('../../syllabus/services/SyllabusService');
const { getTeacherForUser, findMyClasses } = require('../../../utils/teacherScope');

/** Copied verbatim from HomeworkService (not exported there) — keeps identical rounding. */
function computeGradingSummary(records) {
  const graded = records.filter((r) => r.status === 'graded' && r.marks != null);
  const submittedCount = records.filter((r) => ['submitted', 'late', 'graded'].includes(r.status)).length;
  const averageMarks = graded.length > 0
    ? Math.round((graded.reduce((sum, r) => sum + r.marks, 0) / graded.length) * 10) / 10
    : null;
  return { submittedCount, gradedCount: graded.length, averageMarks };
}

/**
 * Reports, like Dashboard, owns no schema — it's read-only aggregation over
 * models registered by other modules. Missing models are skipped gracefully.
 */
class ReportService {
  _tryModel(db, name) {
    try { return db.model(name); }
    catch { return null; }
  }

  async overview(db) {
    const Student = this._tryModel(db, 'Student');
    const Teacher = this._tryModel(db, 'Teacher');
    const Caretaker = this._tryModel(db, 'Caretaker');
    const Class = this._tryModel(db, 'Class');
    const Event = this._tryModel(db, 'Event');
    const Examination = this._tryModel(db, 'Examination');

    const [
      studentsByClass,
      studentsByStatus,
      teachersByDepartment,
      teachersByStatus,
      caretakersByStatus,
      eventsByStatus,
      eventsByCategory,
      examsByStatus,
      examsByType,
    ] = await Promise.all([
      Student ? Student.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$academic.class', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]) : [],
      Student ? Student.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]) : [],
      Teacher ? Teacher.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$professional.department', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]) : [],
      Teacher ? Teacher.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]) : [],
      Caretaker ? Caretaker.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]) : [],
      Event ? Event.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]) : [],
      Event ? Event.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]) : [],
      Examination ? Examination.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]) : [],
      Examination ? Examination.aggregate([
        { $match: { isDeleted: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]) : [],
    ]);

    const normalize = (rows) => rows.map(r => ({ label: r._id || 'Unspecified', count: r.count }));

    return {
      students: { byClass: normalize(studentsByClass), byStatus: normalize(studentsByStatus) },
      teachers: { byDepartment: normalize(teachersByDepartment), byStatus: normalize(teachersByStatus) },
      caretakers: { byStatus: normalize(caretakersByStatus) },
      classes: { total: Class ? await Class.countDocuments({ isDeleted: false }) : 0 },
      events: { byStatus: normalize(eventsByStatus), byCategory: normalize(eventsByCategory) },
      exams: { byStatus: normalize(examsByStatus), byType: normalize(examsByType) },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * GET /reports/teacher?type=&from=&to=&classId= — ONE endpoint, `type` picks
   * the report. Only types with a real, teacher-attributable data source are
   * computed; everything else returns `available: false` with an honest
   * explanation instead of zeros that could be mistaken for real results.
   */
  async teacherReport(db, user, { type, from, to, classId }) {
    const empty = { type, from: from || null, to: to || null, classId: classId || null, summary: null, rows: [] };

    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) {
      return { ...empty, available: false, message: 'No teacher profile linked to this account.' };
    }

    if (type === 'behaviour') {
      return {
        ...empty,
        available: false,
        message: 'Behaviour reports need behaviour notes recorded for your classes — today only administrators can record them, so teachers have nothing to report on yet.',
      };
    }
    if (type === 'exams') {
      return {
        ...empty,
        available: false,
        message: 'Examination reports will be available once an exams module records marks for your classes.',
      };
    }
    if (type === 'attendance') return this._attendanceReport(db, teacher, { from, to, classId });
    if (type === 'homework') return this._homeworkReport(db, teacher, { from, to, classId });
    if (type === 'syllabus') return this._syllabusReport(db, user, teacher, { from, to, classId });

    return { ...empty, available: false, message: 'Unknown report type.' };
  }

  /** Attendance is only ever marked by the class teacher, so this reports on classes this teacher owns. */
  async _attendanceReport(db, teacher, { from, to, classId }) {
    const Attendance = this._tryModel(db, 'Attendance');
    let ownedClasses = await findMyClasses(db, teacher._id);
    if (classId) ownedClasses = ownedClasses.filter((k) => String(k._id) === String(classId));

    const rows = [];
    const totals = { present: 0, absent: 0, late: 0, excused: 0, holiday: 0, total: 0 };

    for (const klass of ownedClasses) {
      for (const section of klass.sections || []) {
        const filter = { class: klass._id, section };
        if (from || to) {
          filter.date = {};
          if (from) filter.date.$gte = new Date(from);
          if (to) filter.date.$lte = new Date(to);
        }
        const records = Attendance ? await Attendance.find(filter).lean() : [];
        const counts = { present: 0, absent: 0, late: 0, excused: 0, holiday: 0 };
        records.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });
        const total = records.length;
        const denominator = total - counts.holiday;
        const percentage = denominator > 0 ? Math.round((counts.present / denominator) * 1000) / 10 : null;

        rows.push({ className: klass.name, section, ...counts, total, percentage });
        Object.keys(counts).forEach((k) => { totals[k] += counts[k]; });
        totals.total += total;
      }
    }

    const overallDenominator = totals.total - totals.holiday;
    const overallPercentage = overallDenominator > 0 ? Math.round((totals.present / overallDenominator) * 1000) / 10 : null;

    return {
      type: 'attendance', from: from || null, to: to || null, classId: classId || null, available: true,
      message: ownedClasses.length === 0 ? "You aren't the class teacher of any class, so there's no attendance register to report on." : null,
      summary: { ...totals, percentage: overallPercentage },
      rows,
    };
  }

  async _homeworkReport(db, teacher, { from, to, classId }) {
    const Homework = this._tryModel(db, 'Homework');
    const Submission = this._tryModel(db, 'Submission');
    const Student = this._tryModel(db, 'Student');

    const filter = { teacher: teacher._id };
    if (classId) filter.class = classId;
    if (from || to) {
      filter.dueDate = {};
      if (from) filter.dueDate.$gte = new Date(from);
      if (to) filter.dueDate.$lte = new Date(to);
    }

    const list = Homework
      ? await Homework.find(filter)
          .sort({ dueDate: 1 })
          .populate([{ path: 'class', select: 'name academicYear' }, { path: 'subject', select: 'name' }])
          .lean()
      : [];

    const rows = [];
    let submissionRatesSum = 0, submissionRatesCount = 0, marksSum = 0, marksCount = 0;

    for (const hw of list) {
      const roster = hw.class && Student
        ? await attendanceRepo.roster(Student, { className: hw.class.name, section: hw.section, academicYear: hw.academicYear })
        : [];
      const submissions = Submission ? await Submission.find({ homework: hw._id }).lean() : [];
      const { submittedCount, gradedCount, averageMarks } = computeGradingSummary(submissions);
      const totalStudents = roster.length;
      const submissionRate = totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 1000) / 10 : null;

      rows.push({
        title: hw.title, className: hw.class?.name || null, section: hw.section, subjectName: hw.subject?.name || null,
        dueDate: hw.dueDate, totalStudents, submittedCount, gradedCount, averageMarks, submissionRate,
      });

      if (submissionRate != null) { submissionRatesSum += submissionRate; submissionRatesCount += 1; }
      if (averageMarks != null) { marksSum += averageMarks; marksCount += 1; }
    }

    return {
      type: 'homework', from: from || null, to: to || null, classId: classId || null, available: true, message: null,
      summary: {
        totalAssigned: list.length,
        avgSubmissionRate: submissionRatesCount > 0 ? Math.round((submissionRatesSum / submissionRatesCount) * 10) / 10 : null,
        avgMarks: marksCount > 0 ? Math.round((marksSum / marksCount) * 10) / 10 : null,
      },
      rows,
    };
  }

  /** Coverage is a point-in-time snapshot (reuses deriveCoverage's own `now`), so `from`/`to` don't apply here. */
  async _syllabusReport(db, user, teacher, { from, to, classId }) {
    const TimetableEntry = this._tryModel(db, 'TimetableEntry');
    const Class = this._tryModel(db, 'Class');
    const base = { type: 'syllabus', from: from || null, to: to || null, classId: classId || null, available: true, message: null };
    if (!TimetableEntry || !Class) return { ...base, summary: null, rows: [] };

    const entries = await TimetableEntry.find({ staff: teacher._id }).lean();
    const seen = new Set();
    const combos = [];
    entries.forEach((e) => {
      if (classId && String(e.class) !== String(classId)) return;
      const key = `${e.class}_${e.section}`;
      if (seen.has(key)) return;
      seen.add(key);
      combos.push({ classId: e.class, section: e.section });
    });

    const rows = [];
    for (const combo of combos) {
      const klass = await Class.findById(combo.classId).lean();
      if (!klass) continue;
      const subjectEntries = await syllabusService.getProgress(db, user, {
        academicYear: klass.academicYear, classId: combo.classId, section: combo.section,
      });
      subjectEntries.forEach((entry) => {
        rows.push({
          className: klass.name, section: combo.section, subjectName: entry.subject.name,
          coveragePercent: entry.coverage.coveragePercent, indicator: entry.coverage.indicator,
          totalPlannedPeriods: entry.coverage.totalPlannedPeriods, completedPlannedPeriods: entry.coverage.completedPlannedPeriods,
        });
      });
    }

    const withPeriods = rows.filter((r) => r.totalPlannedPeriods > 0);
    const avgCoverage = withPeriods.length > 0
      ? Math.round((withPeriods.reduce((sum, r) => sum + r.coveragePercent, 0) / withPeriods.length) * 10) / 10
      : null;

    return { ...base, summary: { subjectsTracked: rows.length, avgCoveragePercent: avgCoverage }, rows };
  }
}

module.exports = new ReportService();
