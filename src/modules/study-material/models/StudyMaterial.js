'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * StudyMaterial — one teaching resource a teacher shares for a class+subject
 * they teach, optionally tagged to a SyllabusTopic (the shared curriculum
 * spine — same model Lesson Planning references, not duplicated here).
 *
 * `url`/`description` are plain link/text fields, NOT a file upload: this
 * codebase has `multer`/`cloudinary` as installed dependencies with an empty
 * config block, but neither is wired into any route or service anywhere
 * (same gap already documented on Homework.attachmentUrl and
 * LessonPlan.resources). TODO: replace with real file storage once an
 * upload pipeline exists.
 */
const studyMaterialSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    academicYear: { type: String, required: true, trim: true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusTopic', default: null },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ['notes', 'pdf', 'video', 'ppt', 'worksheet', 'question_bank', 'previous_paper'],
      required: true,
      index: true,
    },
    // TODO: replace with a real file reference once an upload pipeline exists.
    url: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    visibility: { type: String, enum: ['private', 'class', 'school'], default: 'private' },
  },
  { timestamps: true }
);

studyMaterialSchema.index({ teacher: 1, type: 1 });
studyMaterialSchema.index({ class: 1, section: 1 });

studyMaterialSchema.plugin(baseSchemaPlugin);
registerModel('StudyMaterial', studyMaterialSchema);
module.exports = studyMaterialSchema;
