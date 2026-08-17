'use strict';
const ApiError = require('../../../core/ApiError');
const {
  getCaretakerForUser, myRoutes, ownsRoute, rosterForRoute, ownsStudent, resolveParentContact,
} = require('../../../utils/caretakerScope');
const { getIo } = require('../../../realtime/ioRegistry');
const { emitTripEnded } = require('../../../realtime/trackingNamespace');
const { ROLES } = require('../../../utils/constants');

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/**
 * Bus-trip logging for the caretaker (van) portal. Scoped entirely through
 * `Caretaker.assignedStudents`/`vehicleDetails.route` (see caretakerScope.js
 * — there is no separate TransportRoute model to join against). Every
 * timestamp that matters for the official record (`departedAt`, `arrivedAt`,
 * each student log's `timestamp`) is stamped with server time — a caretaker
 * can never backdate or fudge these via client input.
 */
class CaretakerTransportService {
  async _requireCaretaker(db, user) {
    const caretaker = await getCaretakerForUser(db, user.id);
    if (!caretaker) throw ApiError.forbidden('No caretaker profile linked to this account.');
    return caretaker;
  }

  /**
   * GET /caretaker-transport/my-routes — this caretaker's own route(s) +
   * roster, each student's parent contact resolved LIVE from `Student.
   * parent` (never the `assignedStudents[].parentPhone` snapshot, which can
   * go stale the moment a parent's number changes in the real profile).
   * "Stops in order" — there is no stop-sequence field on the roster, so
   * this is the distinct stop names in first-appearance order (the order
   * the principal entered the roster), not a fabricated sequence number.
   * There is also no stored "driver phone" anywhere in this schema
   * (`vehicleDetails.driver` is a name only) — `caretakerPhone` below is
   * honestly the CARETAKER's own number, not invented driver contact info.
   */
  async getMyRoutes(db, user) {
    const caretaker = await this._requireCaretaker(db, user);
    const routes = myRoutes(caretaker);

    const allStudentIds = (caretaker.assignedStudents || []).map((s) => s.studentId);
    const studentDocs = await db.model('Student').find({ _id: { $in: allStudentIds } }).select('parent').lean();
    const byId = new Map(studentDocs.map((s) => [String(s._id), s]));

    return routes.map((route) => {
      const roster = rosterForRoute(caretaker, route);
      const stops = [...new Set(roster.flatMap((s) => [s.pickupPoint, s.dropPoint]).filter(Boolean))];

      return {
        route,
        vehicleNo: caretaker.vehicleDetails?.vehicleNumber || null,
        driver: caretaker.vehicleDetails?.driver || null,
        caretakerPhone: caretaker.personal?.phone || null,
        stops,
        students: roster.map((s) => ({
          studentId: s.studentId,
          admissionNo: s.admissionNo,
          name: s.name,
          class: s.class,
          section: s.section,
          rollNo: s.rollNo,
          pickupPoint: s.pickupPoint,
          dropPoint: s.dropPoint,
          parentContact: resolveParentContact(byId.get(String(s.studentId))),
        })),
      };
    });
  }

  /** GET /caretaker-transport/profile — the caretaker's own profile only (resolved from the token's own userId, never a client-supplied id). */
  async getProfile(db, user) {
    const caretaker = await this._requireCaretaker(db, user);
    return {
      caretakerId: caretaker.caretakerId,
      personal: caretaker.personal,
      photo: caretaker.photo || null,
      status: caretaker.status,
      routes: myRoutes(caretaker),
      vehicleDetails: caretaker.vehicleDetails,
    };
  }

  /**
   * PATCH /caretaker-transport/profile — allow-list only, same discipline
   * as the teacher's own `PATCH /profile/me`: a caretaker may correct their
   * own phone/email, never anything about their route/vehicle assignment,
   * verification status, or documents (those are principal/administrator
   * territory in the existing `caretaker` directory module).
   */
  async updateProfile(db, user, payload) {
    const caretaker = await this._requireCaretaker(db, user);
    const update = {};
    if (payload.personal?.phone !== undefined) update['personal.phone'] = payload.personal.phone;
    if (payload.personal?.email !== undefined) update['personal.email'] = payload.personal.email;

    await db.model('Caretaker').updateOne({ _id: caretaker._id }, { $set: { ...update, updatedBy: user.id } });
    return this.getProfile(db, user);
  }

  /** POST /caretaker-transport/trips — starts a trip; departedAt is server time, never client-supplied. */
  async startTrip(db, user, { route, direction, date }) {
    const caretaker = await this._requireCaretaker(db, user);
    if (!ownsRoute(caretaker, route)) throw ApiError.forbidden('You are not assigned to this route.');

    return db.model('BusTrip').create({
      route,
      direction,
      date: startOfDay(date || new Date()),
      departedAt: new Date(),
      status: 'in_progress',
      loggedBy: caretaker._id,
      createdBy: user.id,
      updatedBy: user.id,
    });
  }

  /** Resolves a trip AND proves it belongs to this caretaker — 404 otherwise, never leaking another route's trip. */
  async _getOwnTrip(db, user, tripId) {
    const caretaker = await this._requireCaretaker(db, user);
    const trip = await db.model('BusTrip').findById(tripId);
    if (!trip || String(trip.loggedBy) !== String(caretaker._id)) {
      throw ApiError.notFound('Trip not found.');
    }
    return { caretaker, trip };
  }

  /** PATCH /caretaker-transport/trips/:id/arrive — arrivedAt is server time; completes the trip. */
  async arriveTrip(db, user, tripId) {
    const { trip } = await this._getOwnTrip(db, user, tripId);
    if (trip.status === 'completed') throw ApiError.conflict('This trip is already completed.');

    trip.arrivedAt = new Date();
    trip.status = 'completed';
    trip.updatedBy = user.id;
    await trip.save();

    // Tell everyone watching (principal + any parent) this trip is over —
    // their map must show "ended", never a frozen last position presented
    // as still-live.
    const io = getIo();
    if (io) emitTripEnded(io, trip._id);

    return trip;
  }

  /**
   * GET /caretaker-transport/active-trips — PRINCIPAL/ADMINISTRATOR only,
   * unscoped (every currently in-progress trip across every route) — the
   * data source for the live map. Includes the full `trail` (staff-facing,
   * for drawing a path) — this endpoint is never reachable by a parent or
   * student token (see the route's own role guard).
   */
  async listActiveTrips(db, user) {
    if (!user.roles.some((r) => [ROLES.PRINCIPAL, ROLES.ADMINISTRATOR].includes(r))) {
      throw ApiError.forbidden('Only principal/administrator may view all active trips.');
    }
    const trips = await db.model('BusTrip').find({ status: 'in_progress' }).lean();
    if (!trips.length) return [];

    const caretakers = await db.model('Caretaker').find({ _id: { $in: trips.map((t) => t.loggedBy) } })
      .select('caretakerId personal.firstName personal.lastName vehicleDetails').lean();
    const byId = new Map(caretakers.map((c) => [String(c._id), c]));

    return trips.map((t) => {
      const caretaker = byId.get(String(t.loggedBy));
      return {
        tripId: t._id,
        route: t.route,
        direction: t.direction,
        departedAt: t.departedAt,
        lastLocation: t.lastLocation || null,
        trail: t.trail || [],
        vehicleNo: caretaker?.vehicleDetails?.vehicleNumber || null,
        caretakerName: caretaker ? `${caretaker.personal?.firstName || ''} ${caretaker.personal?.lastName || ''}`.trim() : null,
      };
    });
  }

  /**
   * POST /caretaker-transport/trips/:id/student-log — upsert so re-marking
   * corrects the SAME row (unique on busTrip+student) rather than
   * duplicating; `timestamp` is always server time.
   */
  async logStudent(db, user, tripId, { studentId, action }) {
    const { caretaker, trip } = await this._getOwnTrip(db, user, tripId);

    const roster = rosterForRoute(caretaker, trip.route);
    const rosterEntry = roster.find((s) => String(s.studentId) === String(studentId));
    if (!ownsStudent(caretaker, studentId) || !rosterEntry) {
      throw ApiError.forbidden('This student is not on your route.');
    }

    const stop = trip.direction === 'pickup' ? rosterEntry.pickupPoint : rosterEntry.dropPoint;

    return db.model('BusTripStudentLog').findOneAndUpdate(
      { busTrip: trip._id, student: studentId },
      {
        $set: {
          busTrip: trip._id, student: studentId, action, stop,
          timestamp: new Date(), updatedBy: user.id,
        },
        $setOnInsert: { createdBy: user.id },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  /** GET /caretaker-transport/trips?date= — this caretaker's own trip history, with per-student logs. */
  async listTrips(db, user, { date } = {}) {
    const caretaker = await this._requireCaretaker(db, user);
    const filter = { loggedBy: caretaker._id };
    if (date) filter.date = { $gte: startOfDay(date), $lte: endOfDay(date) };

    const trips = await db.model('BusTrip').find(filter).sort({ date: -1, departedAt: -1 }).lean();
    if (!trips.length) return [];

    const logs = await db
      .model('BusTripStudentLog')
      .find({ busTrip: { $in: trips.map((t) => t._id) } })
      .lean();
    const byTrip = new Map();
    logs.forEach((l) => {
      if (!byTrip.has(String(l.busTrip))) byTrip.set(String(l.busTrip), []);
      byTrip.get(String(l.busTrip)).push(l);
    });

    return trips.map((t) => ({ ...t, studentLogs: byTrip.get(String(t._id)) || [] }));
  }
}

module.exports = new CaretakerTransportService();
