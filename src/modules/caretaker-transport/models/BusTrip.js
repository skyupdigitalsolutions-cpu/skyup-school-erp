'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * A single bus run (one direction, one day) logged by the assigned
 * caretaker. `route` is a plain string — there is no `TransportRoute` model
 * anywhere in this codebase (confirmed by reading the schema); it matches
 * `Caretaker.vehicleDetails.route`/`Caretaker.assignedStudents[].route` and
 * `Student.transport.routeNo` exactly, so a future student-portal Transport
 * page can join on it directly without any new entity.
 *
 * `departedAt`/`arrivedAt` are ALWAYS server-stamped (`new Date()` at the
 * moment the request is handled) — never taken from client input — so a
 * caretaker's phone clock being wrong can never skew the official record.
 */
const locationPoint = {
  _id: false,
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  timestamp: { type: Date, required: true },
};

const busTripSchema = new mongoose.Schema({
  route: { type: String, required: true, trim: true, index: true },
  date: { type: Date, required: true, index: true },
  direction: { type: String, enum: ['pickup', 'drop'], required: true },
  departedAt: { type: Date, default: null },
  arrivedAt: { type: Date, default: null },
  status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started', index: true },
  loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Caretaker', required: true },

  // Live-tracking additions. `lastLocation` is what a PARENT ever sees (the
  // single most-recent point) — the full `trail` is staff-facing only
  // (principal's map draws a path), never exposed to the student-portal
  // per the explicit "no historical GPS trail for parents" guardrail this
  // was built against. Capped at the 500 most recent points ($slice on
  // write) so a long trip can't grow this document unbounded.
  lastLocation: { type: locationPoint, default: null },
  trail: { type: [locationPoint], default: [] },
}, { timestamps: true });

busTripSchema.index({ route: 1, date: 1, direction: 1 });
busTripSchema.plugin(baseSchemaPlugin);
registerModel('BusTrip', busTripSchema);
module.exports = busTripSchema;
