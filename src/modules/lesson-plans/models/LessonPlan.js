'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * LessonPlan — one planned lesson a teacher writes for a class+section+subject
 * they teach, for a given date. References the shared SyllabusTopic spine
 * (`topics`) so completing a plan can later drive syllabus coverage, without
 * duplicating the topic list here.
 *
 * `resources` are plain link/text entries, NOT file uploads: this codebase has
 * `multer`/`cloudinary` as installed dependencies with an empty config block,
 * but neither is wired into any route or service anywhere (same gap already
 * documented on Homework.attachmentUrl). TODO: replace with real file storage
 * once an upload pipeline exists.
 */
const lessonPlanSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    academicYear: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    learningObjectives: { type: String, trim: true, default: null },
    teachingMethod: { type: String, trim: true, default: null },
    activities: { type: String, trim: true, default: null },
    assessmentMethod: { type: String, trim: true, default: null },
    topics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'SyllabusTopic' }],
    // TODO: replace with real file references once an upload pipeline exists.
    resources: [{ title: { type: String, trim: true, required: true }, url: { type: String, trim: true, required: true } }],
    status: { type: String, enum: ['draft', 'submitted', 'approved', 'needs_revision'], default: 'draft', index: true },
    reviewNote: { type: String, trim: true, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

lessonPlanSchema.index({ teacher: 1, status: 1 });
lessonPlanSchema.index({ class: 1, section: 1, date: 1 });

lessonPlanSchema.plugin(baseSchemaPlugin);
registerModel('LessonPlan', lessonPlanSchema);
module.exports = lessonPlanSchema;
