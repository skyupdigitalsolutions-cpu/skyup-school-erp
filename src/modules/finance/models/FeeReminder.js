'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * A real WhatsApp send channel now exists (`integrations/whatsapp/
 * WhatsAppClient.js`), so `status` grew two real outcomes alongside the
 * original manual-note path: 'sent' (the provider confirmed acceptance) and
 * 'failed' (it didn't — bad number, provider error, or WhatsApp simply not
 * configured). `'logged'` is UNCHANGED and still used for the manual/phone-
 * call note path — a caretaker calling a parent isn't a WhatsApp send and
 * must never be recorded as one. The UI must never show 'sent' for a row
 * this model didn't get a real provider confirmation for.
 */
const feeReminderSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },
  feeTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeTransaction', default: null },
  channel: { type: String, enum: ['whatsapp', 'sms', 'email', 'manual_note'], default: 'manual_note' },
  message: { type: String, default: null },
  // The due amount actually substituted into the message at send time (null
  // for the manual-note path, which has no amount) — kept for audit, so a
  // reminder's history entry can always be checked against what was really
  // sent, not just trusted after the fact.
  amount: { type: Number, default: null },
  status: { type: String, enum: ['logged', 'sent', 'failed'], default: 'logged' },
  providerMessageId: { type: String, default: null },
  errorMessage: { type: String, default: null },
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

feeReminderSchema.index({ student: 1, createdAt: -1 });
feeReminderSchema.plugin(baseSchemaPlugin);
registerModel('FeeReminder', feeReminderSchema);
module.exports = feeReminderSchema;
