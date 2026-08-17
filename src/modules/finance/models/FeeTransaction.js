'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const feeTransactionSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  academicYear: { type: String, required: true, index: true },
  feeType: { type: String, enum: ['tuition', 'transport', 'hostel', 'exam', 'library', 'other'], required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  paymentMode: { type: String, enum: ['cash', 'cheque', 'online', 'card', 'upi'], default: null },
  transactionRef: { type: String, trim: true, default: null },
  status: { type: String, enum: ['paid', 'pending', 'partial', 'overdue', 'refunded'], default: 'pending', index: true },
  dueDate: { type: Date, default: null },
  paidDate: { type: Date, default: null },
  remarks: { type: String, default: null },
}, { timestamps: true });

feeTransactionSchema.index({ academicYear: 1, status: 1 });
feeTransactionSchema.index({ student: 1, academicYear: 1 });
feeTransactionSchema.plugin(baseSchemaPlugin);
registerModel('FeeTransaction', feeTransactionSchema);
module.exports = feeTransactionSchema;