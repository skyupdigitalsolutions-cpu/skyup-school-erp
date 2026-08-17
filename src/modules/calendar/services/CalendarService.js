'use strict';
const ApiError = require('../../../core/ApiError');
const { getTeacherForUser, findMyClasses } = require('../../../utils/teacherScope');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_TIMETABLE_DAYS = 100; // recurring-slot expansion is capped; other layers still honor the full range.

function dateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Cross-module calendar aggregator. Every layer is populated ONLY from a real
 * source model — a layer whose model doesn't exist in this codebase yet
 * (holidays, meetings) is returned with `available: false` and an empty
 * `items` array, never fabricated data.
 */
class CalendarService {
  _tryModel(db, name) {
    try { return db.model(name); }
    catch { return null; }
  }

  /** Class names this teacher has a real relationship to (teaches or is class-teacher of). */
  async _teacherClassNames(db, teacherId) {
    const Class = this._tryModel(db, 'Class');
    if (!Class) return new Set();

    const TimetableEntry = this._tryModel(db, 'TimetableEntry');
    const classIds = new Set();
    if (TimetableEntry) {
      (await TimetableEntry.find({ staff: teacherId }).distinct('class')).forEach((id) => classIds.add(String(id)));
    }
    (await findMyClasses(db, teacherId)).forEach((c) => classIds.add(String(c._id)));
    if (!classIds.size) return new Set();

    const classes = await Class.find({ _id: { $in: [...classIds] } }).select('name').lean();
    return new Set(classes.map((c) => c.name));
  }

  async _homeworkLayer(db, teacherId, from, to) {
    const Homework = this._tryModel(db, 'Homework');
    if (!Homework) return { key: 'homework', label: 'Homework', available: false, items: [] };

    const rows = await Homework.find({ teacher: teacherId, dueDate: { $gte: from, $lte: to } })
      .select('title dueDate class section')
      .populate({ path: 'class', select: 'name' })
      .lean();

    return {
      key: 'homework',
      label: 'Homework',
      available: true,
      items: rows.map((hw) => ({
        id: `homework_${hw._id}`,
        title: hw.class ? `${hw.title} (${hw.class.name}-${hw.section})` : hw.title,
        date: hw.dueDate,
        layer: 'homework',
        sourceModule: 'homework',
        link: `/teacher/homework/${hw._id}`,
      })),
    };
  }

  async _timetableLayer(db, teacherId, from, to) {
    const TimetableEntry = this._tryModel(db, 'TimetableEntry');
    if (!TimetableEntry) return { key: 'timetable', label: 'Timetable', available: false, items: [] };

    const entries = await TimetableEntry.find({ staff: teacherId })
      .populate([{ path: 'subject', select: 'name' }, { path: 'class', select: 'name' }])
      .lean();

    const items = [];
    if (entries.length) {
      const start = dateOnly(from);
      const cappedTo = new Date(Math.min(to.getTime(), start.getTime() + MAX_TIMETABLE_DAYS * MS_PER_DAY));
      const end = dateOnly(cappedTo);
      const byDow = new Map();
      entries.forEach((e) => {
        if (!byDow.has(e.dayOfWeek)) byDow.set(e.dayOfWeek, []);
        byDow.get(e.dayOfWeek).push(e);
      });

      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + MS_PER_DAY)) {
        const dayEntries = byDow.get(d.getUTCDay()) || [];
        dayEntries
          .sort((a, b) => a.period - b.period)
          .forEach((e) => {
            items.push({
              id: `timetable_${e._id}_${d.toISOString().slice(0, 10)}`,
              title: `${e.subject?.name || 'Subject'} · ${e.class?.name || '?'}-${e.section} (P${e.period})`,
              date: new Date(d),
              layer: 'timetable',
              sourceModule: 'timetable',
              link: '/teacher/timetable',
            });
          });
      }
    }

    return { key: 'timetable', label: 'Timetable', available: true, items };
  }

  async _examsLayer(db, teacherId, from, to) {
    const Examination = this._tryModel(db, 'Examination');
    if (!Examination) return { key: 'exams', label: 'Exams', available: false, items: [] };

    const classNames = await this._teacherClassNames(db, teacherId);
    if (!classNames.size) return { key: 'exams', label: 'Exams', available: true, items: [] };

    const exams = await Examination.find({
      status: { $in: ['scheduled', 'ongoing', 'evaluation', 'completed'] },
      'timetable.date': { $gte: from, $lte: to },
    })
      .select('name timetable')
      .lean();

    const items = [];
    exams.forEach((exam) => {
      (exam.timetable || []).forEach((slot, idx) => {
        if (!slot.date) return;
        if (slot.date < from || slot.date > to) return;
        if (!classNames.has(slot.class)) return;
        items.push({
          id: `exams_${exam._id}_${idx}`,
          title: `${exam.name} · ${slot.subject || 'Subject'} (${slot.class}${slot.section ? '-' + slot.section : ''})`,
          date: slot.date,
          layer: 'exams',
          sourceModule: 'exams',
          link: null,
        });
      });
    });

    return { key: 'exams', label: 'Exams', available: true, items };
  }

  async _eventsLayer(db, from, to) {
    const Event = this._tryModel(db, 'Event');
    if (!Event) return { key: 'events', label: 'Events', available: false, items: [] };

    const rows = await Event.find({
      status: { $in: ['approved', 'ongoing', 'completed'] },
      'schedule.startDate': { $lte: to },
      'schedule.endDate': { $gte: from },
    })
      .select('name category schedule')
      .lean();

    return {
      key: 'events',
      label: 'Events',
      available: true,
      items: rows.map((ev) => ({
        id: `events_${ev._id}`,
        title: ev.name,
        date: ev.schedule.startDate,
        endDate: ev.schedule.endDate,
        layer: 'events',
        sourceModule: 'events',
        link: null,
      })),
    };
  }

  async _personalLayer(db, teacherId, from, to) {
    const Reminder = this._tryModel(db, 'CalendarReminder');
    const rows = await Reminder.find({ teacher: teacherId, date: { $gte: from, $lte: to } }).lean();

    return {
      key: 'personal',
      label: 'Personal Reminders',
      available: true,
      items: rows.map((r) => ({
        id: `personal_${r._id}`,
        title: r.title,
        date: r.date,
        note: r.note,
        layer: 'personal',
        sourceModule: 'personal',
        link: null,
        editable: true,
      })),
    };
  }

  /** GET /calendar/me?from=&to= — the aggregation. */
  async getAggregate(db, userId, { from, to }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) {
      return {
        from,
        to,
        layers: [
          { key: 'homework', label: 'Homework', available: false, items: [] },
          { key: 'timetable', label: 'Timetable', available: false, items: [] },
          { key: 'exams', label: 'Exams', available: false, items: [] },
          { key: 'holidays', label: 'Holidays', available: false, items: [] },
          { key: 'meetings', label: 'Meetings', available: false, items: [] },
          { key: 'events', label: 'Events', available: false, items: [] },
          { key: 'personal', label: 'Personal Reminders', available: false, items: [] },
        ],
      };
    }

    const [homework, timetable, exams, events, personal] = await Promise.all([
      this._homeworkLayer(db, teacher._id, from, to),
      this._timetableLayer(db, teacher._id, from, to),
      this._examsLayer(db, teacher._id, from, to),
      this._eventsLayer(db, from, to),
      this._personalLayer(db, teacher._id, from, to),
    ]);

    return {
      from,
      to,
      layers: [
        homework,
        timetable,
        exams,
        { key: 'holidays', label: 'Holidays', available: false, items: [] },
        { key: 'meetings', label: 'Meetings', available: false, items: [] },
        events,
        personal,
      ],
    };
  }

  async _getOwnedReminder(db, teacherId, reminderId) {
    const reminder = await db.model('CalendarReminder').findById(reminderId).lean();
    if (!reminder) throw ApiError.notFound('Reminder not found.');
    if (!teacherId || String(reminder.teacher) !== String(teacherId)) {
      throw ApiError.forbidden('You do not own this reminder.');
    }
    return reminder;
  }

  async createReminder(db, user, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    return db.model('CalendarReminder').create({
      ...payload,
      teacher: teacher._id,
      createdBy: user.id,
      updatedBy: user.id,
    });
  }

  async updateReminder(db, user, reminderId, payload) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwnedReminder(db, teacher?._id, reminderId);

    return db
      .model('CalendarReminder')
      .findByIdAndUpdate(reminderId, { $set: { ...payload, updatedBy: user.id } }, { new: true, runValidators: true })
      .lean();
  }

  async deleteReminder(db, user, reminderId) {
    const teacher = await getTeacherForUser(db, user.id);
    await this._getOwnedReminder(db, teacher?._id, reminderId);

    await db.model('CalendarReminder').findByIdAndUpdate(reminderId, {
      $set: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id },
    });
  }
}

module.exports = new CalendarService();
