'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Document — two distinct data sources share one collection, kept straight
 * by `ownerType`:
 *   - 'teacher': owned/uploaded by a teacher (personal docs, certificates).
 *     Editable/deletable only by that teacher.
 *   - 'school': issued BY the school TO teachers (policies, circulars,
 *     training materials). Read-only to teachers; `issuedTo` optionally
 *     narrows visibility to specific teachers (empty/absent = every teacher).
 *
 * `url`/`description` are plain link/text fields, NOT a file upload: this
 * codebase has `multer`/`cloudinary` as installed dependencies with an empty
 * config block, but neither is wired into any route or service anywhere
 * (same gap already documented on Homework.attachmentUrl, LessonPlan.resources,
 * StudyMaterial.url). TODO: replace with real file storage once an upload
 * pipeline exists.
 */
const documentSchema = new mongoose.Schema(
  {
    ownerType: { type: String, enum: ['teacher', 'school'], required: true, index: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
    issuedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }],
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ['personal', 'certificate', 'policy', 'circular', 'training'],
      required: true,
      index: true,
    },
    // TODO: replace with a real file reference once an upload pipeline exists.
    url: { type: String, trim: true, default: null },
    description: { type: String, trim: true, default: null },
    expiryDate: { type: Date, default: null },
  },
  { timestamps: true }
);

documentSchema.index({ owner: 1, category: 1 });
documentSchema.index({ ownerType: 1, category: 1 });

documentSchema.plugin(baseSchemaPlugin);
registerModel('Document', documentSchema);
module.exports = documentSchema;
