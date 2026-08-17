'use strict';
const { getOwnStudent } = require('../../../utils/studentScope');

/**
 * Student-transport has no schema/module of its own — there is no staff-side
 * transport-management engine in this codebase yet (`modules/transport/` is
 * an empty scaffold). The only transport data that exists is the embedded
 * `Student.transport { enrolled, routeNo, stopName, vehicleNo }` object, so
 * this is a read-only view over exactly those four fields — nothing invented
 * (no driver name/phone, pickup/drop time, or GPS; those fields don't exist).
 */
class StudentTransportService {
  /** GET /student-transport/me */
  async getMyTransport(db, user) {
    const student = await getOwnStudent(db, user);
    if (!student || !student.transport?.enrolled) {
      return { enrolled: false, routeNo: null, stopName: null, vehicleNo: null };
    }

    return {
      enrolled: true,
      routeNo: student.transport.routeNo ?? null,
      stopName: student.transport.stopName ?? null,
      vehicleNo: student.transport.vehicleNo ?? null,
    };
  }

  /**
   * GET /student-transport/live-trip — is there a bus in progress on MY
   * route right now, and if so, its LATEST position only. Deliberately
   * never returns `trail` (the historical path) — that stays staff-only on
   * the principal's `GET /caretaker-transport/active-trips`, per the
   * explicit "no GPS history for parents" guardrail this was built against.
   * `BusTrip.route` is joined against `Student.transport.routeNo` directly
   * (both are the same plain string — no TransportRoute entity exists to
   * join through instead, same discipline as every other caretaker-portal
   * read this session).
   */
  async getLiveTrip(db, user) {
    const student = await getOwnStudent(db, user);
    if (!student?.transport?.enrolled || !student.transport.routeNo) {
      return { active: false, trip: null };
    }

    const trip = await db.model('BusTrip')
      .findOne({ route: student.transport.routeNo, status: 'in_progress' })
      .sort({ departedAt: -1 })
      .lean();
    if (!trip) return { active: false, trip: null };

    return {
      active: true,
      trip: {
        tripId: trip._id,
        route: trip.route,
        direction: trip.direction,
        departedAt: trip.departedAt,
        lastLocation: trip.lastLocation || null,
      },
    };
  }
}

module.exports = new StudentTransportService();
