'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * One student's pickup/drop/absent mark within a single BusTrip.
 * Unique on (busTrip, student) — re-marking a student upserts this same row
 * (correcting the action + timestamp) rather than creating a duplicate.
 * `timestamp` is ALWAYS server-set, same discipline as BusTrip's own
 * departedAt/arrivedAt.
 */
const busTripStudentLogSchema = new mongoose.Schema({
  busTrip: { type: mongoose.Schema.Types.ObjectId, ref: 'BusTrip', required: true, index: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  action: { type: String, enum: ['picked_up', 'dropped', 'absent'], required: true },
  timestamp: { type: Date, required: true },
  stop: { type: String, default: null },
}, { timestamps: true });

busTripStudentLogSchema.index({ busTrip: 1, student: 1 }, { unique: true });
busTripStudentLogSchema.plugin(baseSchemaPlugin);
registerModel('BusTripStudentLog', busTripStudentLogSchema);
module.exports = busTripStudentLogSchema;
