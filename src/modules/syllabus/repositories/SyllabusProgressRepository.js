'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class SyllabusProgressRepository extends BaseRepository {
  async listByClassSection(model, { classId, section }) {
    return model.find({ class: classId, section }).lean();
  }

  async markTopic(model, { classId, section, academicYear, topic }, { status, completedOn }, actorId) {
    return model.findOneAndUpdate(
      { class: classId, section, topic },
      {
        $set: {
          status,
          completedOn: completedOn ?? (status === 'completed' ? new Date() : null),
          markedBy: actorId,
          updatedBy: actorId,
          academicYear,
        },
        $setOnInsert: { createdBy: actorId },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  /**
   * Nudge a topic to `in_progress` as a SIDE EFFECT of a lesson plan being
   * submitted — never regresses a topic a teacher already marked further
   * along (in_progress or completed) via the tracker itself.
   */
  async advanceIfNotStarted(model, { classId, section, academicYear, topic }, actorId) {
    const existing = await model.findOne({ class: classId, section, topic }).lean();
    if (existing && existing.status !== 'not_started') return existing;
    return this.markTopic(model, { classId, section, academicYear, topic }, { status: 'in_progress' }, actorId);
  }
}

module.exports = new SyllabusProgressRepository();
