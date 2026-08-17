'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * ExamSchedule — one subject's sitting within an Exam: the exam timetable a
 * student will eventually view. Scoped by class+SECTION, not class alone —
 * matching the granularity every other module in this codebase scopes by
 * (TimetableEntry, Attendance, Homework), since sections can sit a subject
 * on different days/rooms.
 */
const examScheduleSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    date: { type: Date, required: true },
    startTime: { type: String, trim: true, default: null }, // "HH:MM"
    endTime: { type: String, trim: true, default: null },
    room: { type: String, trim: true, default: null },
    maxMarks: { type: Number, required: true, min: 1, default: 100 },
  },
  { timestamps: true }
);

// A subject can't be double-scheduled for the same class+section within one exam.
examScheduleSchema.index(
  { exam: 1, class: 1, section: 1, subject: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
examScheduleSchema.index({ class: 1, section: 1, date: 1 });

examScheduleSchema.plugin(baseSchemaPlugin);
registerModel('ExamSchedule', examScheduleSchema);
module.exports = examScheduleSchema;
