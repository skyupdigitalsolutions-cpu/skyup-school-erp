'use strict';
const ApiError = require('../../../core/ApiError');
const { getTeacherForUser, hasClassAccess } = require('../../../utils/teacherScope');
const progressRepo = require('../../syllabus/repositories/SyllabusProgressRepository');

const POPULATE = [
  { path: 'class', select: 'name academicYear' },
  { path: 'subject', select: 'name code' },
  { path: 'topics', select: 'title' },
];

/**
 * Teacher-owned lesson plans: creation requires teaching the target class
 * (same broad `hasClassAccess` gate as Homework); every other action requires
 * being the SPECIFIC teacher who created it.
 */
class LessonPlanService {
  _m(db) { return db.model('LessonPlan'); }

  async _getOwned(db, teacherId, planId) {
    const plan = await this._m(db).findById(planId).lean();
    if (!plan) throw ApiError.notFound('Lesson plan not found.');
    if (!teacherId || String(plan.teacher) !== String(teacherId)) {
      throw ApiError.forbidden('You do not own this lesson plan.');
    }
    return plan;
  }

  /** Only keep topic ids that actually exist and belong to this subject — never trust the client's list blindly. */
  async _resolveTopics(db, subjectId, topicIds) {
    if (!topicIds || !topicIds.length) return [];
    const valid = await db.model('SyllabusTopic').find({ _id: { $in: topicIds }, subject: subjectId }).select('_id').lean();
    return valid.map((t) => t._id);
  }

  /**
   * Submitting a plan is evidence the lesson was actually taught, so tagged
   * topics advance to `in_progress` — never further (a teacher must still
   * mark `completed` explicitly via the Syllabus Tracker; one lesson isn't
   * proof a whole topic is done), and never backwards.
   */
  async _advanceTopicProgress(db, plan, actorUserId) {
    if (plan.status !== 'submitted' || !plan.topics?.length) return;
    const ProgressModel = db.model('SyllabusProgress');
    await Promise.all(
      plan.topics.map((topicId) =>
        progressRepo
          .advanceIfNotStarted(
            ProgressModel,
            { classId: plan.class, section: plan.section, academicYear: plan.academicYear, topic: topicId },
            actorUserId
          )
          .catch(() => null)
      )
    );
  }

  /** GET /lesson-plans/mine?from=&to=&classId=&status= */
  async listMine(db, userId, { from, to, classId, status }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const filter = { teacher: teacher._id };
    if (classId) filter.class = classId;
    if (status && status !== 'all') filter.status = status;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to) filter.date.$lte = to;
    }

    return this._m(db).find(filter).sort({ date: 1 }).populate(POPULATE).lean();
  }

  /** GET /lesson-plans/:id */
  async getOne(db, user, planId) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwned(db, teacher?._id, planId);
    return this._m(db).findById(planId).populate(POPULATE).lean();
  }

  /** POST /lesson-plans — verifies class access before creating anything. */
  async create(db, user, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    const allowed = await hasClassAccess(db, teacher._id, payload.class, payload.section);
    if (!allowed) throw ApiError.forbidden('You do not teach this class.');

    const klass = await db.model('Class').findById(payload.class).lean();
    if (!klass) throw ApiError.badRequest('Class not found.');

    const topics = await this._resolveTopics(db, payload.subject, payload.topics);

    const created = await this._m(db).create({
      ...payload,
      topics,
      teacher: teacher._id,
      academicYear: klass.academicYear,
      createdBy: user.id,
      updatedBy: user.id,
    });

    await this._advanceTopicProgress(db, created, user.id);
    return this._m(db).findById(created._id).populate(POPULATE).lean();
  }

  /** PATCH /lesson-plans/:id — class/section/subject are immutable after creation, same as Homework. */
  async update(db, user, planId, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    const plan = await this._getOwned(db, teacher?._id, planId);

    const patch = { ...payload, updatedBy: user.id };
    if (payload.topics) {
      patch.topics = await this._resolveTopics(db, plan.subject, payload.topics);
    }

    const updated = await this._m(db).findByIdAndUpdate(planId, { $set: patch }, { new: true, runValidators: true }).lean();
    await this._advanceTopicProgress(db, updated, user.id);
    return this._m(db).findById(planId).populate(POPULATE).lean();
  }

  /**
   * PATCH /lesson-plans/:id/review — principal/admin only (route-gated).
   * Optional approval transition: teachers themselves can only reach
   * draft/submitted (enforced by the update validation schema), so this is
   * the only path to approved/needs_revision.
   */
  async review(db, user, planId, { status, reviewNote }) {
    const plan = await this._m(db).findById(planId).lean();
    if (!plan) throw ApiError.notFound('Lesson plan not found.');

    return this._m(db)
      .findByIdAndUpdate(
        planId,
        { $set: { status, reviewNote: reviewNote ?? null, reviewedBy: user.id, reviewedAt: new Date(), updatedBy: user.id } },
        { new: true, runValidators: true }
      )
      .populate(POPULATE)
      .lean();
  }
}

module.exports = new LessonPlanService();
