'use strict';
const ApiError = require('../../../core/ApiError');
const { ROLES } = require('../../../utils/constants');
const {
  getTeacherForUser,
  checkClassAccess,
  assertClassAccess,
} = require('../../../utils/teacherScope');

const SCHEDULE_POPULATE = [
  { path: 'class', select: 'name academicYear' },
  { path: 'subject', select: 'name code' },
];

// `sections` is included so the frontend's "schedule a subject" form can
// populate its section dropdown straight from the exam's own classes.
const EXAM_CLASSES_POPULATE = { path: 'classes', select: 'name academicYear sections' };

function isStaffUnrestricted(user) {
  return user.roles.includes(ROLES.PRINCIPAL) || user.roles.includes(ROLES.ADMINISTRATOR);
}

/**
 * Exam creation/scheduling (principal/admin) + marks entry (subject teacher,
 * scoped to their own class+section+subject via the exact same
 * `teacherScope.js` helpers the timetable/homework/attendance modules use;
 * principal/admin are unrestricted). A separate, real-collection engine from
 * the legacy `Examination` model — see Exam.js's own comment for why.
 */
class ExamSchedulingService {
  _exam(db) { return db.model('Exam'); }
  _schedule(db) { return db.model('ExamSchedule'); }
  _mark(db) { return db.model('ExamMark'); }

  // ── Exam CRUD (principal/admin) ──────────────────────────────────────────

  async listExams(db, filters, pagination) {
    const q = {};
    if (filters.academicYear) q.academicYear = filters.academicYear;
    if (filters.status) q.status = filters.status;
    if (filters.classId) q.classes = filters.classId;
    const Exam = this._exam(db);
    const safeLimit = Math.min(Math.max(Number(pagination.limit) || 20, 1), 100);
    const safePage = Math.max(Number(pagination.page) || 1, 1);
    const [items, total] = await Promise.all([
      Exam.find(q).sort({ startDate: -1, createdAt: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit)
        .populate(EXAM_CLASSES_POPULATE).lean(),
      Exam.countDocuments(q),
    ]);
    return { items, total, page: safePage, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
  }

  async getExam(db, id) {
    const exam = await this._exam(db).findById(id).populate(EXAM_CLASSES_POPULATE).lean();
    if (!exam) throw ApiError.notFound('Exam not found.');
    return exam;
  }

  async createExam(db, payload, actorId) {
    const created = await this._exam(db).create({ ...payload, createdBy: actorId, updatedBy: actorId });
    return this.getExam(db, created._id);
  }

  async updateExam(db, id, payload, actorId) {
    await this.getExam(db, id);
    await this._exam(db).findByIdAndUpdate(id, { $set: { ...payload, updatedBy: actorId } }, { runValidators: true });
    return this.getExam(db, id);
  }

  /** results_published is a real status value here — the gate the (future)
   * student view must check before showing any marks. No transition rules
   * are enforced (matches the legacy Examination model's own changeStatus —
   * a plain field set, not a state machine), just the enum itself. */
  async changeExamStatus(db, id, status, actorId) {
    await this.getExam(db, id);
    await this._exam(db).findByIdAndUpdate(id, { $set: { status, updatedBy: actorId } });
    return this.getExam(db, id);
  }

  async deleteExam(db, id, actorId) {
    const exam = await this._exam(db).findById(id);
    if (!exam) throw ApiError.notFound('Exam not found.');
    await exam.softDelete(actorId);
    return { message: 'Exam deleted.' };
  }

  // ── Exam schedule / timetable (principal/admin write; teacher-scoped read) ──

  /**
   * Non-throwing read scoping, same discipline as `checkClassAccess`: a
   * teacher only ever sees the sittings for classes/subjects they actually
   * teach, never the whole exam's schedule.
   */
  async getSchedule(db, user, examId) {
    await this.getExam(db, examId);
    const rows = await this._schedule(db).find({ exam: examId }).sort({ date: 1 }).populate(SCHEDULE_POPULATE).lean();

    if (isStaffUnrestricted(user)) return rows;

    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) return [];

    const checks = await Promise.all(
      rows.map((r) => checkClassAccess(db, user, { classId: r.class._id, section: r.section, subjectId: r.subject._id }))
    );
    return rows.filter((_, i) => checks[i].allowed);
  }

  /** Friendlier pre-check ahead of the unique-index backstop, matching TimetableService's own pattern. */
  async addScheduleRow(db, examId, payload, actorId) {
    await this.getExam(db, examId);
    const existing = await this._schedule(db).findOne({
      exam: examId, class: payload.class, section: payload.section, subject: payload.subject,
    }).lean();
    if (existing) {
      throw ApiError.conflict('This subject is already scheduled for this class/section in this exam.');
    }
    const created = await this._schedule(db).create({ ...payload, exam: examId, createdBy: actorId, updatedBy: actorId });
    return this._schedule(db).findById(created._id).populate(SCHEDULE_POPULATE).lean();
  }

  async _getScheduleRow(db, scheduleId) {
    const row = await this._schedule(db).findById(scheduleId).populate(SCHEDULE_POPULATE).lean();
    if (!row) throw ApiError.notFound('Exam schedule entry not found.');
    return row;
  }

  async updateScheduleRow(db, scheduleId, payload, actorId) {
    await this._getScheduleRow(db, scheduleId);
    await this._schedule(db).findByIdAndUpdate(scheduleId, { $set: { ...payload, updatedBy: actorId } }, { runValidators: true });
    return this._getScheduleRow(db, scheduleId);
  }

  async deleteScheduleRow(db, scheduleId, actorId) {
    const row = await this._schedule(db).findById(scheduleId);
    if (!row) throw ApiError.notFound('Exam schedule entry not found.');
    await row.softDelete(actorId);
    return { message: 'Exam schedule entry deleted.' };
  }

  // ── Marks entry (subject teacher, scoped; principal/admin unrestricted) ──

  async _assertMarksAccess(db, user, scheduleRow) {
    if (isStaffUnrestricted(user)) return;
    await assertClassAccess(db, user, {
      classId: scheduleRow.class._id, section: scheduleRow.section, subjectId: scheduleRow.subject._id,
    });
  }

  /** GET .../marks-sheet — the class roster for this sitting with each student's current mark (blank if unentered). */
  async getMarksSheet(db, user, scheduleId) {
    const row = await this._getScheduleRow(db, scheduleId);
    await this._assertMarksAccess(db, user, row);

    const roster = await db
      .model('Student')
      .find({
        'academic.class': row.class.name,
        'academic.section': row.section,
        'academic.academicYear': row.class.academicYear,
        status: 'active',
      })
      .lean();

    const marks = await this._mark(db).find({ examSchedule: scheduleId }).lean();
    const byStudent = new Map(marks.map((m) => [String(m.student), m]));

    const students = roster
      .map((s) => {
        const mark = byStudent.get(String(s._id));
        return {
          studentId: s._id,
          admissionNo: s.admissionNo,
          rollNo: s.rollNo,
          name: `${s.personal?.firstName || ''} ${s.personal?.lastName || ''}`.trim(),
          marksObtained: mark?.marksObtained ?? null,
          isAbsent: mark?.isAbsent || false,
          remarks: mark?.remarks || null,
        };
      })
      .sort((a, b) => {
        const na = Number(a.rollNo); const nb = Number(b.rollNo);
        if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
        return String(a.rollNo || '').localeCompare(String(b.rollNo || ''));
      });

    return { schedule: row, students };
  }

  /**
   * POST .../marks — bulk upsert (re-entry corrects, never duplicates — the
   * opposite of the legacy Examination model's `$push`-only marks array).
   * marksObtained must not exceed the sitting's own maxMarks.
   */
  async enterMarks(db, user, scheduleId, records, actorId) {
    const row = await this._getScheduleRow(db, scheduleId);
    await this._assertMarksAccess(db, user, row);

    const over = records.find((r) => r.marksObtained != null && r.marksObtained > row.maxMarks);
    if (over) {
      throw ApiError.badRequest(`Marks (${over.marksObtained}) cannot exceed the maximum of ${row.maxMarks}.`);
    }

    const saved = [];
    for (const r of records) {
      const doc = await this._mark(db).findOneAndUpdate(
        { examSchedule: scheduleId, student: r.studentId },
        {
          $set: {
            marksObtained: r.isAbsent ? null : (r.marksObtained ?? null),
            isAbsent: !!r.isAbsent,
            remarks: r.remarks ?? null,
            enteredBy: actorId,
            updatedBy: actorId,
          },
          $setOnInsert: { createdBy: actorId },
        },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      saved.push(doc);
    }

    await db
      .model('ActivityLog')
      .create({
        entityType: 'teacher',
        entityId: (await getTeacherForUser(db, user.id))?._id || row.subject._id,
        action: 'exam_marks_entered',
        description: `Entered marks for ${saved.length} student(s) — ${row.subject.name}, class ${row.class.name}-${row.section}.`,
        performedBy: user.id,
      })
      .catch(() => {});

    return saved;
  }
}

module.exports = new ExamSchedulingService();
