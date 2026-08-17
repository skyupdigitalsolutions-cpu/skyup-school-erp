'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Deliberately separate from the staff HR `LeaveRequest` model
 * (`modules/leave-management/models/LeaveRequest.js`) — that one is
 * teacher/caretaker applicant leave with an HR leave-type set (sick/casual/
 * earned/maternity/paternity/unpaid). A student's leave-of-absence is a
 * different domain entirely (no applicantType/applicantModel polymorphism
 * needed — it's always a Student), with its own student-appropriate
 * leaveType set. The status/decide shape below intentionally mirrors
 * LeaveRequest's (status enum, decidedBy/decidedAt/approverRemarks) so the
 * approval workflow feels identical to staff, without sharing a collection.
 */
const studentLeaveRequestSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true }, // the parent/student StudentAccount user's id
  leaveType: { type: String, enum: ['sick', 'family', 'travel', 'other'], required: true },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  totalDays: { type: Number, required: true, min: 0.5 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  approverRemarks: { type: String, default: null },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });

studentLeaveRequestSchema.index({ student: 1, fromDate: -1 });
studentLeaveRequestSchema.plugin(baseSchemaPlugin);
registerModel('StudentLeaveRequest', studentLeaveRequestSchema);
module.exports = studentLeaveRequestSchema;
