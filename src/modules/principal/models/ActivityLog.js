'use strict';

const mongoose = require('mongoose');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * ActivityLog — stores the Recent Activity Timeline entries for both
 * Student and Teacher profiles. Intentionally lightweight; uses a capped
 * collection so it never grows unbounded.
 */
const activityLogSchema = new mongoose.Schema(
  {
    entityType: { type: String, enum: ['student', 'teacher', 'syllabus_progress', 'attendance'], required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, required: true }, // e.g. "status_changed", "document_uploaded"
    description: { type: String, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    performedAt: { type: Date, default: Date.now },
  },
  { timestamps: false, capped: { size: 52428800, max: 50000 } } // 50 MB cap, max 50 k docs
);

registerModel('ActivityLog', activityLogSchema);
module.exports = activityLogSchema;
