'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/** ExamMark — one student's mark for one ExamSchedule sitting. Rows are
 * upserted (see ExamSchedulingService.enterMarks), never pushed/duplicated —
 * unlike the legacy `Examination.marks` embedded array. */
const examMarkSchema = new mongoose.Schema(
  {
    examSchedule: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSchedule', required: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    marksObtained: { type: Number, default: null, min: 0 },
    isAbsent: { type: Boolean, default: false },
    remarks: { type: String, trim: true, default: null },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

examMarkSchema.index(
  { examSchedule: 1, student: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

examMarkSchema.plugin(baseSchemaPlugin);
registerModel('ExamMark', examMarkSchema);
module.exports = examMarkSchema;
