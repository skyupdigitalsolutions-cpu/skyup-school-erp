'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Exam — a named exam period (e.g. "Term 1 Mid-Term"). This is a SEPARATE,
 * new engine from the pre-existing `Examination` model (exams module) — that
 * model is a single mega-document (embedded timetable/marks/results arrays,
 * $push-only marks with no upsert, no teacher scoping, string-based
 * class/subject fields that can't hook into `teacherScope.js`) and is left
 * untouched here since its principal-facing directory/create UI is already
 * live. `Exam`/`ExamSchedule`/`ExamMark` are real, separately-scoped
 * collections built for the marks-entry + student-view use case instead.
 *
 * `results_published` is the gate the (future) student/parent view must
 * check before showing any marks — it never defaults to published.
 */
const examSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    academicYear: { type: String, required: true, trim: true },
    type: { type: String, enum: ['unit_test', 'midterm', 'final', 'other'], default: 'unit_test' },
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'ongoing', 'completed', 'results_published'],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

examSchema.index({ academicYear: 1, status: 1 });

examSchema.plugin(baseSchemaPlugin);
registerModel('Exam', examSchema);
module.exports = examSchema;
