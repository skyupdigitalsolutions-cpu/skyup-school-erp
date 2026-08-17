'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Maintenance/Infrastructure/Stationery/CCA expense log — the one place in
 * this codebase Finance actually WRITES money data (everything else in the
 * finance-dashboard feature is read-only). No PUT, no hard delete: once
 * created, `amount`/`category`/`date` are immutable — the only correction
 * path is `reverse()` (see ExpenseService), which creates a NEW row with a
 * negated amount (`reversalOf` pointing back) and flips the original's
 * `status` to 'reversed', never touching the original's stored amount. This
 * makes the ledger reconstructable from the log at any point: summing
 * `amount` across every row (reversed originals included) always nets to
 * the true total, since a reversal's negative amount exactly cancels the
 * original's positive one.
 *
 * NOTE: the spec this was built from listed `amount: { min: 0 }`, but that
 * directly contradicts the reversal design (a reversal row is a NEGATIVE
 * amount by construction). Kept unbounded rather than silently breaking
 * reversal — flagged here instead of quietly "fixing" the spec.
 */
const expenseSchema = new mongoose.Schema({
  category: { type: String, enum: ['maintenance', 'infrastructure', 'stationery', 'cca'], required: true, index: true },
  subCategory: { type: String, default: null },
  amount: { type: Number, required: true },
  academicYear: { type: String, required: true, index: true },
  date: { type: Date, required: true, default: Date.now },
  vendor: { type: String, default: null },
  paymentMode: { type: String, enum: ['cash', 'cheque', 'online', 'card', 'upi'], default: null },
  transactionRef: { type: String, default: null },
  remarks: { type: String, default: null },
  status: { type: String, enum: ['recorded', 'reversed'], default: 'recorded', index: true },
  reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Expense', default: null },
}, { timestamps: true });

expenseSchema.index({ category: 1, academicYear: 1 });
expenseSchema.index({ academicYear: 1, date: 1 });
expenseSchema.plugin(baseSchemaPlugin);
registerModel('Expense', expenseSchema);
module.exports = expenseSchema;
