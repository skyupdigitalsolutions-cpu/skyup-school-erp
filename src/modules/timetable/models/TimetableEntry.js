'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * TimetableEntry — one recurring weekly slot. This is also the source of
 * truth for "which staff member teaches which class+section", since there is
 * no separate Enrollment/ClassSection model in this codebase: Teacher's own
 * `assignedSubjects` array is free-text and not queryable by id. Scoping
 * (e.g. "a teacher only sees classes they teach") is derived by matching
 * against these rows — see timetable/syllabus services.
 */
const timetableEntrySchema = new mongoose.Schema(
  {
    academicYear: { type: String, required: true, trim: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
    period: { type: Number, required: true, min: 1, max: 12 },
    room: { type: String, trim: true, default: null },
  },
  { timestamps: true }
);

// One slot can't be double-booked for a class+section.
timetableEntrySchema.index(
  { academicYear: 1, class: 1, section: 1, dayOfWeek: 1, period: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
// "My timetable" queries.
timetableEntrySchema.index({ staff: 1, dayOfWeek: 1 });

timetableEntrySchema.plugin(baseSchemaPlugin);
registerModel('TimetableEntry', timetableEntrySchema);
module.exports = timetableEntrySchema;
