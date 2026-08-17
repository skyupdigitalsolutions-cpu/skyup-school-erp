'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * SyllabusProgress — per (class, section, topic) coverage marker.
 */
const syllabusProgressSchema = new mongoose.Schema(
  {
    academicYear: { type: String, required: true, trim: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusTopic', required: true },
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'completed'],
      default: 'not_started',
    },
    completedOn: { type: Date, default: null },
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

syllabusProgressSchema.index(
  { class: 1, section: 1, topic: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

syllabusProgressSchema.plugin(baseSchemaPlugin);
registerModel('SyllabusProgress', syllabusProgressSchema);
module.exports = syllabusProgressSchema;
