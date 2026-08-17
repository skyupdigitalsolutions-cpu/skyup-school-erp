'use strict';
const ApiError = require('../../../core/ApiError');
const { getTeacherForUser, hasClassAccess } = require('../../../utils/teacherScope');

const POPULATE = [
  { path: 'class', select: 'name academicYear' },
  { path: 'subject', select: 'name code' },
  { path: 'topic', select: 'title' },
];

/**
 * Teacher-owned study material library: creation requires teaching the
 * target class (same broad `hasClassAccess` gate as Homework/LessonPlan);
 * every other action requires being the SPECIFIC teacher who uploaded it.
 */
class StudyMaterialService {
  _m(db) { return db.model('StudyMaterial'); }

  async _getOwned(db, teacherId, materialId) {
    const material = await this._m(db).findById(materialId).lean();
    if (!material) throw ApiError.notFound('Study material not found.');
    if (!teacherId || String(material.teacher) !== String(teacherId)) {
      throw ApiError.forbidden('You do not own this study material.');
    }
    return material;
  }

  /** A topic tag only sticks if it actually belongs to the material's subject — never trust the client blindly. */
  async _resolveTopic(db, subjectId, topicId) {
    if (!topicId) return null;
    const topic = await db.model('SyllabusTopic').findOne({ _id: topicId, subject: subjectId }).select('_id').lean();
    return topic ? topic._id : null;
  }

  /** GET /study-material/mine?type=&subject=&classId= */
  async listMine(db, userId, { type, subject, classId }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const filter = { teacher: teacher._id };
    if (type) filter.type = type;
    if (subject) filter.subject = subject;
    if (classId) filter.class = classId;

    return this._m(db).find(filter).sort({ createdAt: -1 }).populate(POPULATE).lean();
  }

  /** POST /study-material — verifies class access before creating anything. */
  async create(db, user, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    const allowed = await hasClassAccess(db, teacher._id, payload.class, payload.section);
    if (!allowed) throw ApiError.forbidden('You do not teach this class.');

    const klass = await db.model('Class').findById(payload.class).lean();
    if (!klass) throw ApiError.badRequest('Class not found.');

    const topic = await this._resolveTopic(db, payload.subject, payload.topic);

    const created = await this._m(db).create({
      ...payload,
      topic,
      teacher: teacher._id,
      academicYear: klass.academicYear,
      createdBy: user.id,
      updatedBy: user.id,
    });
    return this._m(db).findById(created._id).populate(POPULATE).lean();
  }

  /** PATCH /study-material/:id — class/section/subject are immutable after creation, same as Homework/LessonPlan. */
  async update(db, user, materialId, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    const material = await this._getOwned(db, teacher?._id, materialId);

    const patch = { ...payload, updatedBy: user.id };
    if (payload.topic !== undefined) {
      patch.topic = await this._resolveTopic(db, material.subject, payload.topic);
    }

    return this._m(db)
      .findByIdAndUpdate(materialId, { $set: patch }, { new: true, runValidators: true })
      .populate(POPULATE)
      .lean();
  }

  /** DELETE /study-material/:id */
  async remove(db, user, materialId) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwned(db, teacher?._id, materialId);

    await this._m(db).findByIdAndUpdate(materialId, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id },
    });
  }
}

module.exports = new StudyMaterialService();
