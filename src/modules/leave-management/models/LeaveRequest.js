'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const leaveRequestSchema = new mongoose.Schema({
  applicantType: { type: String, enum: ['teacher', 'caretaker'], required: true, index: true },
  applicant: { type: mongoose.Schema.Types.ObjectId, required: true, index: true, refPath: 'applicantModel' },
  applicantModel: { type: String, required: true, enum: ['Teacher', 'Caretaker'] },
  leaveType: { type: String, enum: ['sick', 'casual', 'earned', 'maternity', 'paternity', 'unpaid', 'other'], required: true },
  fromDate: { type: Date, required: true },
  toDate: { type: Date, required: true },
  totalDays: { type: Number, required: true, min: 0.5 },
  reason: { type: String, required: true, trim: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  appliedDate: { type: Date, default: Date.now },
  approverRemarks: { type: String, default: null },
  decidedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  decidedAt: { type: Date, default: null },
}, { timestamps: true });

leaveRequestSchema.index({ status: 1, applicantType: 1 });
leaveRequestSchema.index({ applicant: 1, fromDate: -1 });
leaveRequestSchema.plugin(baseSchemaPlugin);
registerModel('LeaveRequest', leaveRequestSchema);
module.exports = leaveRequestSchema;