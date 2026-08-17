'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../config/logger');
const connectionManager = require('../database/connectionManager');
const { getTenantModel } = require('../database/tenantRegistry');
const { TOKEN_TYPES, ROLES } = require('../utils/constants');
const { getCaretakerForUser } = require('../utils/caretakerScope');
const { getOwnStudent } = require('../utils/studentScope');

const MAX_TRAIL_POINTS = 500;
const STAFF_ROLES = [ROLES.PRINCIPAL, ROLES.ADMINISTRATOR];

function tripRoom(tripId) {
  return `trip:${tripId}`;
}

/**
 * Socket.IO `/tracking` namespace — real-time bus location. Authenticated
 * the SAME way as every REST route (tenant resolution + JWT verification,
 * mirroring `tenantResolver.js`/`middlewares/authenticate.js` exactly, not a
 * separate/weaker mechanism just because it's a socket) — a handshake
 * missing a valid token or tenant is rejected outright, never left
 * anonymous. Room-join authorization mirrors the REST scoping this whole
 * caretaker-transport feature already uses:
 *   - principal/administrator: any trip (staff, unscoped)
 *   - caretaker: ONLY a trip they themselves are `loggedBy` on
 *   - parent/student (viewerType-carrying token): ONLY a trip whose `route`
 *     matches their OWN student's `Student.transport.routeNo` — resolved
 *     server-side via `getOwnStudent`, never trusted from the client.
 * A parent's join is NEVER sent the trip's full `trail` (staff-only, on
 * join) — only `lastLocation`, and only live increments after that. This is
 * the "no historical GPS trail for parents" guardrail enforced at the
 * network layer, not just hidden in the UI.
 */
function attachTrackingNamespace(io) {
  const nsp = io.of('/tracking');

  nsp.use(async (socket, next) => {
    try {
      const { token, tenantSlug } = socket.handshake.auth || {};
      if (!token || !tenantSlug) return next(new Error('Missing token or tenantSlug.'));

      const Tenant = getTenantModel(connectionManager.control());
      const tenant = await Tenant.findOne({ slug: String(tenantSlug).toLowerCase() }).lean();
      if (!tenant || tenant.status !== 'active') return next(new Error('Unknown or inactive school.'));

      let payload;
      try {
        payload = jwt.verify(token, config.jwt.accessSecret);
      } catch (err) {
        return next(new Error('Invalid or expired token.'));
      }
      if (payload.type !== TOKEN_TYPES.ACCESS) return next(new Error('Wrong token type.'));
      if (payload.tenant && payload.tenant !== String(tenant._id)) return next(new Error('Token does not belong to this school.'));

      const db = await connectionManager.getTenantConnection(tenant);
      socket.data.db = db;
      socket.data.tenant = { id: String(tenant._id), slug: tenant.slug };
      socket.data.user = {
        id: payload.sub,
        roles: Array.isArray(payload.roles) ? payload.roles : [],
        studentId: payload.studentId || null,
        viewerType: payload.viewerType || null,
      };
      next();
    } catch (err) {
      logger.error(`/tracking handshake error: ${err.message}`);
      next(new Error('Authentication failed.'));
    }
  });

  nsp.on('connection', (socket) => {
    const { db, user } = socket.data;

    /** Resolves whether this socket may join/publish to a trip, and how much history it may see on join. */
    async function authorizeForTrip(tripId) {
      const trip = await db.model('BusTrip').findById(tripId).lean();
      if (!trip) return { allowed: false, trip: null, isStaffView: false };

      if (user.roles.some((r) => STAFF_ROLES.includes(r))) {
        return { allowed: true, trip, isStaffView: true };
      }
      if (user.roles.includes(ROLES.CARETAKER)) {
        const caretaker = await getCaretakerForUser(db, user.id);
        const owns = caretaker && String(trip.loggedBy) === String(caretaker._id);
        return { allowed: !!owns, trip, isStaffView: true, caretaker };
      }
      if (user.studentId) {
        const student = await getOwnStudent(db, user);
        const owns = student?.transport?.enrolled && student.transport.routeNo === trip.route;
        return { allowed: !!owns, trip, isStaffView: false };
      }
      return { allowed: false, trip, isStaffView: false };
    }

    socket.on('join-trip', async ({ tripId } = {}) => {
      if (!tripId) return;
      try {
        const { allowed, trip, isStaffView } = await authorizeForTrip(tripId);
        if (!allowed) {
          socket.emit('tracking-error', { tripId, message: 'Not authorized to view this trip.' });
          return;
        }
        socket.join(tripRoom(tripId));
        // Late-joiners aren't left blank — staff get the full trail (for the
        // path line), a parent/student gets ONLY the latest point, never
        // the trail, per the guardrail.
        socket.emit('trip-snapshot', {
          tripId,
          status: trip.status,
          route: trip.route,
          direction: trip.direction,
          lastLocation: trip.lastLocation || null,
          trail: isStaffView ? trip.trail || [] : undefined,
        });
      } catch (err) {
        logger.error(`join-trip error: ${err.message}`);
        socket.emit('tracking-error', { tripId, message: 'Could not join trip.' });
      }
    });

    socket.on('leave-trip', ({ tripId } = {}) => {
      if (tripId) socket.leave(tripRoom(tripId));
    });

    socket.on('location-update', async ({ tripId, lat, lng } = {}) => {
      if (!tripId || typeof lat !== 'number' || typeof lng !== 'number') return;
      try {
        if (!user.roles.includes(ROLES.CARETAKER)) return; // only a caretaker ever publishes
        const trip = await db.model('BusTrip').findById(tripId);
        if (!trip || trip.status !== 'in_progress') return;

        const caretaker = await getCaretakerForUser(db, user.id);
        if (!caretaker || String(trip.loggedBy) !== String(caretaker._id)) return; // never trust a claim from a non-owning caretaker

        const point = { lat, lng, timestamp: new Date() };
        await db.model('BusTrip').updateOne(
          { _id: tripId },
          { $set: { lastLocation: point }, $push: { trail: { $each: [point], $slice: -MAX_TRAIL_POINTS } } }
        );

        // Broadcast ONLY the single latest point to the room — staff and
        // parents alike get the same live increment; the trail itself is
        // never re-broadcast (only sent once, staff-only, at join time).
        nsp.to(tripRoom(tripId)).emit('location', { tripId, ...point });
      } catch (err) {
        logger.error(`location-update error: ${err.message}`);
      }
    });
  });

  return nsp;
}

/** Called from CaretakerTransportService.arriveTrip so both maps show "trip ended" instead of a frozen last position. */
function emitTripEnded(io, tripId) {
  io.of('/tracking').to(tripRoom(tripId)).emit('trip-ended', { tripId });
}

module.exports = { attachTrackingNamespace, emitTripEnded };
