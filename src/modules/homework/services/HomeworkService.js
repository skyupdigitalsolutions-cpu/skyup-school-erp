'use strict';
const ApiError = require('../../../core/ApiError');
const attendanceRepo = require('../../attendance/repositories/AttendanceRepository');
const { getTeacherForUser, hasClassAccess } = require('../../../utils/teacherScope');

const POPULATE = [
  { path: 'class', select: 'name academicYear' },
  { path: 'subject', select: 'name code' },
];

/** Real counts from actual Submission rows — never fabricated. */
function computeGradingSummary(records) {
  const graded = records.filter((r) => r.status === 'graded' && r.marks != null);
  const submittedCount = records.filter((r) => ['submitted', 'late', 'graded'].includes(r.status)).length;
  const averageMarks = graded.length > 0
    ? Math.round((graded.reduce((sum, r) => sum + r.marks, 0) / graded.length) * 10) / 10
    : null;
  return { submittedCount, gradedCount: graded.length, averageMarks };
}

/**
 * Teacher-owned homework: creation requires teaching the target class
 * (broad `hasClassAccess`, same as My Classes); every other action requires
 * being the SPECIFIC teacher who created it (strict ownership, not just "any
 * teacher of this class") — a co-subject-teacher can't grade someone else's
 * assignment.
 */
class HomeworkService {
  _m(db) { return db.model('Homework'); }
  _sm(db) { return db.model('Submission'); }

  async _getOwned(db, teacherId, homeworkId) {
    const hw = await this._m(db).findById(homeworkId).lean();
    if (!hw) throw ApiError.notFound('Homework not found.');
    if (!teacherId || String(hw.teacher) !== String(teacherId)) {
      throw ApiError.forbidden('You do not own this homework.');
    }
    return hw;
  }

  /** GET /homework/mine?status=&classId= */
  async listMine(db, userId, { status, classId }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const filter = { teacher: teacher._id };
    if (classId) filter.class = classId;

    const now = new Date();
    if (status === 'draft') filter.status = 'draft';
    else if (status === 'scheduled') { filter.status = 'assigned'; filter.dueDate = { $gte: now }; }
    else if (status === 'history') { filter.status = 'assigned'; filter.dueDate = { $lt: now }; }
    // 'all' / omitted -> every status for this teacher.

    const list = await this._m(db).find(filter).sort({ dueDate: 1 }).populate(POPULATE).lean();

    return Promise.all(
      list.map(async (hw) => {
        const roster = hw.class
          ? await attendanceRepo.roster(db.model('Student'), {
              className: hw.class.name, section: hw.section, academicYear: hw.academicYear,
            })
          : [];
        const submissions = await this._sm(db).find({ homework: hw._id }).lean();
        const { submittedCount, gradedCount } = computeGradingSummary(submissions);
        return { ...hw, totalStudents: roster.length, submittedCount, gradedCount };
      })
    );
  }

  /** GET /homework/:id — a single homework's own fields (for detail/edit views). */
  async getOne(db, user, homeworkId) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwned(db, teacher?._id, homeworkId);
    return this._m(db).findById(homeworkId).populate(POPULATE).lean();
  }

  /** POST /homework — verifies class access before creating anything. */
  async create(db, user, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    const allowed = await hasClassAccess(db, teacher._id, payload.class, payload.section);
    if (!allowed) throw ApiError.forbidden('You do not teach this class.');

    const klass = await db.model('Class').findById(payload.class).lean();
    if (!klass) throw ApiError.badRequest('Class not found.');

    const created = await this._m(db).create({
      ...payload,
      teacher: teacher._id,
      academicYear: klass.academicYear,
      createdBy: user.id,
      updatedBy: user.id,
    });
    return this._m(db).findById(created._id).populate(POPULATE).lean();
  }

  /** PATCH /homework/:id */
  async update(db, user, homeworkId, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwned(db, teacher?._id, homeworkId);

    return this._m(db)
      .findByIdAndUpdate(homeworkId, { $set: { ...payload, updatedBy: user.id } }, { new: true, runValidators: true })
      .populate(POPULATE)
      .lean();
  }

  /** GET /homework/:id/submissions — roster merged with real submission rows. */
  async getSubmissions(db, user, homeworkId) {
    const teacher = await getTeacherForUser(db, user.id);
    const hw = await this._getOwned(db, teacher?._id, homeworkId);

    const klass = await db.model('Class').findById(hw.class).lean();
    if (!klass) throw ApiError.notFound('Class not found.');

    const [roster, submissions] = await Promise.all([
      attendanceRepo.roster(db.model('Student'), { className: klass.name, section: hw.section, academicYear: hw.academicYear }),
      this._sm(db).find({ homework: homeworkId }).lean(),
    ]);

    const byStudent = new Map(submissions.map((s) => [String(s.student), s]));
    return roster.map((student) => {
      const sub = byStudent.get(String(student._id));
      return {
        studentId: student._id,
        name: `${student.personal?.firstName || ''} ${student.personal?.lastName || ''}`.trim(),
        rollNo: student.rollNo,
        status: sub?.status || 'not_submitted',
        text: sub?.text || null,
        marks: sub?.marks ?? null,
        feedback: sub?.feedback || null,
        submittedAt: sub?.submittedAt || null,
        gradedAt: sub?.gradedAt || null,
      };
    });
  }

  /** POST /homework/:id/submissions/:studentId/grade */
  async gradeSubmission(db, user, homeworkId, studentId, { status, marks, feedback }) {
    const teacher = await getTeacherForUser(db, user.id);
    const hw = await this._getOwned(db, teacher?._id, homeworkId);

    // Defense in depth: the student must belong to THIS homework's class+section.
    const klass = await db.model('Class').findById(hw.class).lean();
    const student = await db.model('Student').findById(studentId).lean();
    if (!klass || !student || student.academic?.class !== klass.name || student.academic?.section !== hw.section) {
      throw ApiError.notFound('Student not found in this class.');
    }

    const updated = await this._sm(db).findOneAndUpdate(
      { homework: homeworkId, student: studentId },
      {
        $set: {
          status,
          marks: marks ?? null,
          feedback: feedback ?? null,
          gradedBy: user.id,
          gradedAt: new Date(),
          updatedBy: user.id,
        },
        $setOnInsert: { createdBy: user.id },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await db
      .model('ActivityLog')
      .create({
        entityType: 'teacher',
        entityId: teacher._id,
        action: 'homework_graded',
        description: `Graded "${hw.title}" for ${student.personal?.firstName || 'a student'} — marked ${status}.`,
        performedBy: user.id,
      })
      .catch(() => {});

    return updated;
  }

  /** GET /homework/:id/analytics — real counts only, no fabricated numbers. */
  async getAnalytics(db, user, homeworkId) {
    const teacher = await getTeacherForUser(db, user.id);
    const hw = await this._getOwned(db, teacher?._id, homeworkId);

    const klass = await db.model('Class').findById(hw.class).lean();
    const roster = klass
      ? await attendanceRepo.roster(db.model('Student'), { className: klass.name, section: hw.section, academicYear: hw.academicYear })
      : [];
    const submissions = await this._sm(db).find({ homework: homeworkId }).lean();

    const { submittedCount, gradedCount, averageMarks } = computeGradingSummary(submissions);
    const totalStudents = roster.length;

    return {
      homeworkId,
      totalStudents,
      submittedCount,
      pendingCount: totalStudents - submittedCount,
      gradedCount,
      averageMarks,
      submissionRate: totalStudents > 0 ? Math.round((submittedCount / totalStudents) * 1000) / 10 : null,
    };
  }
}

module.exports = new HomeworkService();
