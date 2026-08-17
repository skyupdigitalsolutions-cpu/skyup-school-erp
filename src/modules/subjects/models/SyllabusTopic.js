'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * SyllabusTopic — THE SHARED SPINE. A tree of curriculum topics (unit ->
 * chapter -> topic via the nullable `parent` self-reference) that the
 * syllabus tracker owns and that lesson plans / study material (later
 * modules) will reference by _id.
 */
const syllabusTopicSchema = new mongoose.Schema(
  {
    academicYear: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    grade: { type: String, required: true, trim: true },
    parent: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusTopic', default: null },
    title: { type: String, required: true, trim: true },
    sequence: { type: Number, default: 0 },
    plannedPeriods: { type: Number, required: true, min: 1, default: 1 },
  },
  { timestamps: true }
);

syllabusTopicSchema.index({ subject: 1, grade: 1, academicYear: 1 });
syllabusTopicSchema.index({ parent: 1 });

syllabusTopicSchema.plugin(baseSchemaPlugin);
registerModel('SyllabusTopic', syllabusTopicSchema);
module.exports = syllabusTopicSchema;
