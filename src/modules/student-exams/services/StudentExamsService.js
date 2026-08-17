'use strict';
const ApiError = require('../../../core/ApiError');
const { getOwnStudent } = require('../../../utils/studentScope');

const SCHEDULE_POPULATE = [{ path: 'subject', select: 'name code' }];

/**
 * Read-only student/parent view of the exam-scheduling engine (Exam /
 * ExamSchedule / ExamMark — NOT the legacy Examination model). Scoped to the
 * logged-in student's own class+section via `getOwnStudent`, never a
 * client-supplied id. Schedule/timetable/admit-card are visible any time an
 * exam exists for the student's class; RESULTS are gated on
 * `exam.status === 'results_published'` — the exact same enum value
 * `ExamSchedulingService.changeExamStatus` writes — and are never computed
 * or returned before that (no grade-scale math is invented; this module has
 * none to reuse, so results are a plain real sum/percentage of the stored
 * marksObtained/maxMarks values only).
 */
class StudentExamsService {
  async _resolveStudentAndClass(db, user) {
    const student = await getOwnStudent(db, user);
    if (!student) return { student: null, klass: null };
    const klass = await db
      .model('Class')
      .findOne({ name: student.academic.class, academicYear: student.academic.academicYear })
      .lean();
    return { student, klass };
  }

  /** GET /student-exams/me — exams that apply to the logged-in student's own class. */
  async listMyExams(db, user) {
    const { klass } = await this._resolveStudentAndClass(db, user);
    if (!klass) return [];
    return db
      .model('Exam')
      .find({ classes: klass._id })
      .sort({ startDate: -1, createdAt: -1 })
      .select('title type academicYear startDate endDate status')
      .lean();
  }

  /** Resolves the exam AND proves it genuinely applies to this student's class — 404 otherwise, never leaking another class's exam. */
  async _getExamForStudent(db, user, examId) {
    const { student, klass } = await this._resolveStudentAndClass(db, user);
    if (!student || !klass) throw ApiError.notFound('No student profile linked to this account.');

    const exam = await db.model('Exam').findById(examId).lean();
    if (!exam || !exam.classes.some((c) => String(c) === String(klass._id))) {
      throw ApiError.notFound('Exam not found.');
    }
    return { student, klass, exam };
  }

  async _getScheduleRows(db, student, klass, examId) {
    return db
      .model('ExamSchedule')
      .find({ exam: examId, class: klass._id, section: student.academic.section })
      .sort({ date: 1 })
      .populate(SCHEDULE_POPULATE)
      .lean();
  }

  /** GET /student-exams/:examId/timetable — visible regardless of results status. */
  async getTimetable(db, user, examId) {
    const { student, klass, exam } = await this._getExamForStudent(db, user, examId);
    const rows = await this._getScheduleRows(db, student, klass, examId);
    return {
      exam: { _id: exam._id, title: exam.title, type: exam.type, status: exam.status },
      sittings: rows.map((r) => ({
        _id: r._id, subject: r.subject, date: r.date, startTime: r.startTime, endTime: r.endTime, room: r.room, maxMarks: r.maxMarks,
      })),
    };
  }

  /** GET /student-exams/:examId/admit-card — available once the exam is scheduled. */
  async getAdmitCard(db, user, examId) {
    const { student, klass, exam } = await this._getExamForStudent(db, user, examId);
    const rows = await this._getScheduleRows(db, student, klass, examId);
    return {
      student: {
        name: `${student.personal?.firstName || ''} ${student.personal?.lastName || ''}`.trim(),
        photo: student.photo || null,
        admissionNo: student.admissionNo,
        rollNo: student.rollNo,
        className: klass.name,
        section: student.academic.section,
      },
      exam: { _id: exam._id, title: exam.title, type: exam.type, academicYear: exam.academicYear },
      sittings: rows.map((r) => ({
        subject: r.subject, date: r.date, startTime: r.startTime, endTime: r.endTime, room: r.room,
      })),
    };
  }

  /**
   * GET /student-exams/:examId/results — GATED. Pre-publish, no marks are
   * queried or returned at all, only the gate state itself.
   */
  async getResults(db, user, examId) {
    const { student, klass, exam } = await this._getExamForStudent(db, user, examId);

    if (exam.status !== 'results_published') {
      return { published: false, exam: { _id: exam._id, title: exam.title, status: exam.status }, subjects: [], summary: null };
    }

    const rows = await this._getScheduleRows(db, student, klass, examId);
    const marks = await db
      .model('ExamMark')
      .find({ examSchedule: { $in: rows.map((r) => r._id) }, student: student._id })
      .lean();
    const byMark = new Map(marks.map((m) => [String(m.examSchedule), m]));

    const subjects = rows.map((r) => {
      const m = byMark.get(String(r._id));
      return {
        subject: r.subject,
        maxMarks: r.maxMarks,
        marksObtained: m?.marksObtained ?? null,
        isAbsent: m?.isAbsent || false,
        remarks: m?.remarks || null,
      };
    });

    // Real sum/percentage over stored values only — subjects with no mark yet
    // (or marked absent) are excluded from the denominator rather than
    // fabricating a zero.
    const scored = subjects.filter((s) => !s.isAbsent && s.marksObtained != null);
    const totalObtained = scored.reduce((sum, s) => sum + s.marksObtained, 0);
    const totalMax = scored.reduce((sum, s) => sum + s.maxMarks, 0);
    const percentage = totalMax > 0 ? Math.round((totalObtained / totalMax) * 1000) / 10 : null;

    return {
      published: true,
      exam: { _id: exam._id, title: exam.title, status: exam.status },
      subjects,
      summary: { totalObtained, totalMax, percentage, subjectsCounted: scored.length, subjectsTotal: subjects.length },
    };
  }
}

module.exports = new StudentExamsService();
