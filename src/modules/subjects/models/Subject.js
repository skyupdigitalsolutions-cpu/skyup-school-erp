'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Subject — a taught subject within this school, applicable to one or more
 * grades. Root of the curriculum spine: SyllabusTopic, TimetableEntry and
 * (later) homework/lesson-plan/study-material modules all hang off this.
 */
const subjectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    grades: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'A subject must apply to at least one grade.',
      },
    },
    description: { type: String, trim: true, default: null },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  },
  { timestamps: true }
);

// Unique among non-deleted subjects of this school (tenant DB already isolates schools).
subjectSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
subjectSchema.index({ grades: 1 });

subjectSchema.plugin(baseSchemaPlugin);
registerModel('Subject', subjectSchema);
module.exports = subjectSchema;
