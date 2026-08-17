'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Submission — one student's status against one Homework. Rows are created
 * lazily (on grading), not pre-populated for the whole roster: a student with
 * no row here is simply "not_submitted" when merged against the class roster
 * (see HomeworkService, same roster-merge pattern as Attendance).
 *
 * `text` is a plain text/link field for the same reason Homework.attachmentUrl
 * is — no file upload pipeline exists in this codebase yet.
 */
const submissionSchema = new mongoose.Schema(
  {
    homework: { type: mongoose.Schema.Types.ObjectId, ref: 'Homework', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    // TODO: replace with real file references once an upload pipeline exists.
    text: { type: String, trim: true, default: null },
    submittedAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['not_submitted', 'submitted', 'late', 'graded'],
      default: 'not_submitted',
    },
    marks: { type: Number, default: null, min: 0 },
    feedback: { type: String, trim: true, default: null },
    gradedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gradedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

submissionSchema.index(
  { homework: 1, student: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

submissionSchema.plugin(baseSchemaPlugin);
registerModel('Submission', submissionSchema);
module.exports = submissionSchema;
