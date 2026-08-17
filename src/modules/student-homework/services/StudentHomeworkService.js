'use strict';
const { getOwnStudent } = require('../../../utils/studentScope');

const POPULATE = [{ path: 'subject', select: 'name code' }];

/**
 * Read-only student/parent view of the existing Homework/Submission models —
 * no new schema, no student-side write path. `Submission` rows are only ever
 * created by the teacher's grade endpoint (see homework/services/
 * HomeworkService.js's own comment on this) — there is no student-submission
 * write to reuse, so this stays view-only, same as the task calls for.
 */
class StudentHomeworkService {
  _isOverdue(hw, mySubmission) {
    return new Date(hw.dueDate) < new Date() && mySubmission.status === 'not_submitted';
  }

  _matchesStatus(item, status) {
    if (!status || status === 'all') return true;
    if (status === 'pending') return item.mySubmission.status === 'not_submitted' && !item.isOverdue;
    if (status === 'overdue') return item.isOverdue;
    if (status === 'submitted') return ['submitted', 'late'].includes(item.mySubmission.status);
    if (status === 'graded') return item.mySubmission.status === 'graded';
    return true;
  }

  /** GET /student-homework/me?status=&from=&to= */
  async listMine(db, user, { status, from, to }) {
    const student = await getOwnStudent(db, user);
    if (!student) return [];

    const klass = await db
      .model('Class')
      .findOne({ name: student.academic.class, academicYear: student.academic.academicYear })
      .lean();
    if (!klass) return [];

    const filter = {
      class: klass._id,
      section: student.academic.section,
      academicYear: student.academic.academicYear,
      status: 'assigned', // a student never sees a teacher's draft homework
    };
    if (from || to) {
      filter.dueDate = {};
      if (from) filter.dueDate.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) filter.dueDate.$lte = new Date(`${to}T23:59:59.999Z`);
    }

    const homework = await db.model('Homework').find(filter).sort({ dueDate: 1 }).populate(POPULATE).lean();
    if (!homework.length) return [];

    // Scoped to THIS student's own rows only — never the whole roster.
    const submissions = await db
      .model('Submission')
      .find({ homework: { $in: homework.map((h) => h._id) }, student: student._id })
      .lean();
    const byHomework = new Map(submissions.map((s) => [String(s.homework), s]));

    const shaped = homework.map((hw) => {
      const sub = byHomework.get(String(hw._id));
      const mySubmission = {
        status: sub?.status || 'not_submitted',
        text: sub?.text || null,
        marks: sub?.marks ?? null,
        feedback: sub?.feedback || null,
        submittedAt: sub?.submittedAt || null,
        gradedAt: sub?.gradedAt || null,
      };
      const item = {
        _id: hw._id,
        subject: hw.subject ? { name: hw.subject.name, code: hw.subject.code } : null,
        title: hw.title,
        description: hw.description,
        attachmentUrl: hw.attachmentUrl,
        assignedDate: hw.assignedDate,
        dueDate: hw.dueDate,
        maxMarks: hw.maxMarks,
        submissionType: hw.submissionType,
        mySubmission,
      };
      item.isOverdue = this._isOverdue(hw, mySubmission);
      return item;
    });

    return shaped.filter((item) => this._matchesStatus(item, status));
  }
}

module.exports = new StudentHomeworkService();
