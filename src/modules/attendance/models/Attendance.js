'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Attendance — one row per student per class+section per day (per `period`,
 * which is null for the daily class-teacher register and only meaningful if
 * a future period-wise attendance feature reuses this model).
 *
 * There is no Enrollment model in this codebase (see TimetableEntry's own
 * comment) — attendance references the Student directly, scoped by
 * class+section the same way Student.academic already is.
 */
const attendanceSchema = new mongoose.Schema(
  {
    academicYear: { type: String, required: true, trim: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    date: { type: Date, required: true },
    period: { type: Number, default: null },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'excused', 'holiday'],
      required: true,
    },
    remarks: { type: String, trim: true, default: null },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Re-submitting the same day corrects existing rows via upsert on this key.
attendanceSchema.index(
  { class: 1, section: 1, student: 1, date: 1, period: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
// Roster-by-date lookups.
attendanceSchema.index({ class: 1, section: 1, date: 1 });
// Per-student summary-over-range lookups.
attendanceSchema.index({ student: 1, date: 1 });

attendanceSchema.plugin(baseSchemaPlugin);
registerModel('Attendance', attendanceSchema);
module.exports = attendanceSchema;
