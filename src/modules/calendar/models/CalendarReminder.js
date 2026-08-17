'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * The one calendar item a teacher can author directly — everything else on
 * the calendar is read-only, aggregated from other modules (homework,
 * timetable, exams, events).
 */
const calendarReminderSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    date: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { timestamps: true }
);

calendarReminderSchema.index({ teacher: 1, date: 1 });
calendarReminderSchema.plugin(baseSchemaPlugin);
registerModel('CalendarReminder', calendarReminderSchema);
module.exports = calendarReminderSchema;
