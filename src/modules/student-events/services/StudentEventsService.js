'use strict';
const ApiError = require('../../../core/ApiError');

// Public-facing statuses only — a parent/student never sees an event still
// in staff workflow (draft/pending_approval) or called off (cancelled).
const PUBLIC_STATUSES = ['approved', 'ongoing', 'completed'];

// The Event model (`modules/events/models/Event.js`) is a staff management
// mega-doc: budget, sponsors, vendors, committees, organizer contact details,
// the participants roster, feedback responses, internal documents, and AI
// insights all live on it. NONE of that belongs in a parent/student feed —
// only the public face of the event. This is an explicit field allow-list,
// not a blocklist, so anything newly added to the model in future is
// excluded by default rather than silently leaking.
const PUBLIC_PROJECTION = 'name category description status schedule.startDate schedule.endDate schedule.agenda venue.hall venue.room venue.address';

/**
 * There is no class/section (or any other audience) targeting field on
 * Event — no `targetClasses`, no `audience`, nothing. Per the task, this is
 * NOT invented; every public event is treated as school-wide and shown to
 * every authenticated parent/student viewer identically.
 */
class StudentEventsService {
  _m(db) { return db.model('Event'); }

  _toPublic(e) {
    return {
      _id: e._id,
      name: e.name,
      category: e.category,
      description: e.description,
      status: e.status,
      startDate: e.schedule?.startDate ?? null,
      endDate: e.schedule?.endDate ?? null,
      agenda: (e.schedule?.agenda || []).map((a) => ({
        session: a.session, time: a.time, speaker: a.speaker, description: a.description,
      })),
      venue: {
        hall: e.venue?.hall ?? null,
        room: e.venue?.room ?? null,
        address: e.venue?.address ?? null,
      },
      isUpcoming: !!(e.schedule?.endDate && new Date(e.schedule.endDate) >= new Date()),
    };
  }

  /** GET /student-events/me — every public event, upcoming first. */
  async listMyEvents(db) {
    const events = await this._m(db)
      .find({ status: { $in: PUBLIC_STATUSES } })
      .select(PUBLIC_PROJECTION)
      .lean();

    const withPublic = events.map((e) => this._toPublic(e));
    const upcoming = withPublic.filter((e) => e.isUpcoming).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const past = withPublic.filter((e) => !e.isUpcoming).sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    return [...upcoming, ...past];
  }

  /** GET /student-events/:id — same projection, single event, 404 if not public. */
  async getMyEvent(db, id) {
    const e = await this._m(db).findOne({ _id: id, status: { $in: PUBLIC_STATUSES } }).select(PUBLIC_PROJECTION).lean();
    if (!e) throw ApiError.notFound('Event not found.');
    return this._toPublic(e);
  }
}

module.exports = new StudentEventsService();
