'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const noticeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  category: { type: String, enum: ['general', 'academic', 'event', 'exam', 'urgent'], default: 'general', index: true },
  audience: { type: String, enum: ['all', 'teachers', 'students', 'parents', 'caretakers'], default: 'all', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium', index: true },
  pinned: { type: Boolean, default: false, index: true },
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'published', index: true },
  publishedDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
}, { timestamps: true });

noticeSchema.index({ status: 1, pinned: -1, publishedDate: -1 });
noticeSchema.plugin(baseSchemaPlugin);
registerModel('Notice', noticeSchema);
module.exports = noticeSchema;