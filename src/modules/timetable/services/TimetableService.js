'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/TimetableRepository');
const { getTeacherForUser, checkClassAccess } = require('../../../utils/teacherScope');

const DAYS = [0, 1, 2, 3, 4, 5, 6];

function groupByDay(entries) {
  const byDay = new Map(DAYS.map((d) => [d, []]));
  entries.forEach((e) => {
    if (!byDay.has(e.dayOfWeek)) byDay.set(e.dayOfWeek, []);
    byDay.get(e.dayOfWeek).push(e);
  });
  return DAYS.map((dayOfWeek) => ({
    dayOfWeek,
    periods: (byDay.get(dayOfWeek) || []).sort((a, b) => a.period - b.period),
  }));
}

class TimetableService {
  _m(db) { return db.model('TimetableEntry'); }

  /** GET /timetable/me — resolves the teacher from the logged-in user. */
  async getMine(db, userId) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return groupByDay([]);
    const entries = await repo.forStaff(this._m(db), teacher._id);
    return groupByDay(entries);
  }

  /**
   * GET /timetable/class/:classId/:section — scoped to teachers who teach it.
   * A teacher who doesn't teach this class simply sees an empty grid rather
   * than a 403/404 that would leak whether the class exists.
   */
  async getForClassSection(db, user, { academicYear, classId, section }) {
    const { allowed } = await checkClassAccess(db, user, { classId, section });
    if (!allowed) return groupByDay([]);
    const entries = await repo.forClassSection(this._m(db), { academicYear, classId, section });
    return groupByDay(entries);
  }

  async create(db, payload, actorId) {
    const existing = await repo.findSlot(this._m(db), {
      academicYear: payload.academicYear,
      classId: payload.class,
      section: payload.section,
      dayOfWeek: payload.dayOfWeek,
      period: payload.period,
    });
    if (existing) {
      throw ApiError.conflict(
        `Period ${payload.period} on day ${payload.dayOfWeek} is already booked for this class/section.`
      );
    }
    return repo.create(this._m(db), payload, actorId);
  }

  async bulkCreate(db, entries, actorId) {
    const created = [];
    const skipped = [];
    for (const payload of entries) {
      const existing = await repo.findSlot(this._m(db), {
        academicYear: payload.academicYear,
        classId: payload.class,
        section: payload.section,
        dayOfWeek: payload.dayOfWeek,
        period: payload.period,
      });
      if (existing) {
        skipped.push({ ...payload, reason: 'Slot already booked.' });
        continue;
      }
      created.push(await repo.create(this._m(db), payload, actorId));
    }
    return { created, skipped };
  }
}

module.exports = new TimetableService();
// Shared with the student-portal timetable view (student-timetable module) —
// same day/period grouping, reused rather than reimplemented.
module.exports.groupByDay = groupByDay;
