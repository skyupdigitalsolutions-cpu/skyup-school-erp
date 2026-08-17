'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Homework — one assignment a teacher gives to a class+section they teach.
 *
 * `attachmentUrl` is a plain link/text field, NOT a file upload: this codebase
 * has `multer`/`cloudinary` as installed dependencies with an empty config
 * block, but neither is wired into any route or service anywhere. Building a
 * fake uploader that saves nowhere would be worse than being honest about the
 * gap — TODO: replace with real file storage once a pipeline exists.
 */
const homeworkSchema = new mongoose.Schema(
  {
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    academicYear: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: null },
    // TODO: replace with a real file reference once an upload pipeline exists.
    attachmentUrl: { type: String, trim: true, default: null },
    assignedDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    maxMarks: { type: Number, default: null, min: 0 },
    submissionType: { type: String, enum: ['online', 'physical'], default: 'physical' },
    status: { type: String, enum: ['draft', 'assigned'], default: 'draft', index: true },
  },
  { timestamps: true }
);

homeworkSchema.index({ teacher: 1, status: 1 });
homeworkSchema.index({ class: 1, section: 1 });

homeworkSchema.plugin(baseSchemaPlugin);
registerModel('Homework', homeworkSchema);
module.exports = homeworkSchema;
