'use strict';
const ApiError = require('../../../core/ApiError');
const progressRepo = require('../repositories/SyllabusProgressRepository');
const { buildTopicTree } = require('../../subjects/services/topicTree');
const { deriveCoverage } = require('./coverage');
const { checkClassAccess, assertClassAccess } = require('../../../utils/teacherScope');

class SyllabusService {
  _progressModel(db) { return db.model('SyllabusProgress'); }

  /**
   * A teacher who doesn't teach this class simply sees no subjects/topics
   * (read-path scoping — see checkClassAccess) rather than a 403/404.
   */
  async getProgress(db, user, { academicYear, classId, section }) {
    const { allowed } = await checkClassAccess(db, user, { classId, section });
    if (!allowed) return [];

    const klass = await db.model('Class').findById(classId).lean();
    if (!klass) throw ApiError.notFound('Class not found.');
    const grade = klass.name;
    const yearLabel = academicYear || klass.academicYear;

    const timetableFilter = { class: classId, section };
    if (academicYear) timetableFilter.academicYear = academicYear;
    const timetableRows = await db.model('TimetableEntry').find(timetableFilter).lean();

    const periodsPerWeekBySubject = new Map();
    timetableRows.forEach((row) => {
      const key = String(row.subject);
      periodsPerWeekBySubject.set(key, (periodsPerWeekBySubject.get(key) || 0) + 1);
    });
    const subjectIds = [...periodsPerWeekBySubject.keys()];
    if (subjectIds.length === 0) return [];

    const [subjects, topics, progressRows] = await Promise.all([
      db.model('Subject').find({ _id: { $in: subjectIds } }).lean(),
      db.model('SyllabusTopic').find({ subject: { $in: subjectIds }, grade }).lean(),
      progressRepo.listByClassSection(this._progressModel(db), { classId, section }),
    ]);

    const progressByTopic = new Map(progressRows.map((p) => [String(p.topic), p]));
    const topicsWithStatus = topics.map((t) => ({
      ...t,
      status: progressByTopic.get(String(t._id))?.status || 'not_started',
      completedOn: progressByTopic.get(String(t._id))?.completedOn || null,
    }));

    const now = new Date();
    return subjects.map((subject) => {
      const subjectTopics = topicsWithStatus.filter((t) => String(t.subject) === String(subject._id));
      const periodsPerWeek = periodsPerWeekBySubject.get(String(subject._id)) || 0;
      return {
        subject: { id: subject._id, name: subject.name, code: subject.code },
        topicTree: buildTopicTree(subjectTopics),
        coverage: deriveCoverage({ topics: subjectTopics, periodsPerWeek, academicYearLabel: yearLabel, now }),
      };
    });
  }

  async markProgress(db, user, { academicYear, class: classId, section, topic, status, completedOn }) {
    const topicDoc = await db.model('SyllabusTopic').findById(topic).lean();
    if (!topicDoc) throw ApiError.notFound('Syllabus topic not found.');

    await assertClassAccess(db, user, { classId, section, subjectId: topicDoc.subject });

    const updated = await progressRepo.markTopic(
      this._progressModel(db),
      { classId, section, academicYear, topic },
      { status, completedOn },
      user.id
    );

    await db.model('ActivityLog').create({
      entityType: 'syllabus_progress',
      entityId: updated._id,
      action: 'status_changed',
      description: `Topic "${topicDoc.title}" marked ${status} for class/section ${section}.`,
      meta: { topic, classId, section, status },
      performedBy: user.id,
    }).catch(() => {});

    return updated;
  }
}

module.exports = new SyllabusService();
