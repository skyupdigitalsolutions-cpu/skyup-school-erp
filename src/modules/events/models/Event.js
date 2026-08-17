'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const eventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, default: null },
  category: { type: String, required: true, index: true }, // cultural, sports, academic, etc.
  description: { type: String, default: null },
  academicYear: { type: String, required: true, index: true },
  status: { type: String, enum: ['draft','pending_approval','approved','ongoing','completed','cancelled'], default: 'draft', index: true },

  schedule: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    agenda: [{ session: String, time: String, speaker: String, description: String }],
  },

  venue: {
    hall: String,
    room: String,
    address: String,
    seatingCapacity: { type: Number, default: 0 },
    facilities: [String],
  },

  organizer: {
    name: { type: String, required: true },
    department: String,
    phone: String,
    email: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },

  committees: [{
    role: String, // coordinator, volunteer, staff
    name: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    responsibility: String,
  }],

  participants: {
    students: [{ studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' }, name: String, class: String, attended: { type: Boolean, default: false } }],
    teachers: [{ teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' }, name: String, attended: { type: Boolean, default: false } }],
    guests: [{ name: String, organization: String, attended: { type: Boolean, default: false } }],
    totalRegistered: { type: Number, default: 0 },
    totalAttended: { type: Number, default: 0 },
  },

  budget: {
    approved: { type: Number, default: 0 },
    utilized: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    vendors: [{ name: String, amount: Number, paid: { type: Boolean, default: false }, invoiceUrl: String }],
  },

  sponsors: [{ name: String, contribution: Number, type: String, agreementUrl: String }],

  resources: [{ name: String, type: String, quantity: Number, status: String }],

  results: [{ category: String, rank: Number, participantName: String, prize: String, certificateUrl: String }],

  feedback: {
    averageRating: { type: Number, default: 0 },
    totalResponses: { type: Number, default: 0 },
    responses: [{ fromType: String, rating: Number, comment: String, submittedAt: Date }],
  },

  documents: [{ name: String, type: String, url: String, uploadedAt: { type: Date, default: Date.now } }],

  aiInsights: {
    attendancePrediction: String,
    budgetVariance: String,
    participationTrends: String,
    recommendations: [String],
    generatedAt: Date,
  },
}, { timestamps: true });

eventSchema.index({ 'schedule.startDate': 1, status: 1 });
eventSchema.index({ name: 'text', eventId: 'text', 'organizer.name': 'text' });
eventSchema.plugin(baseSchemaPlugin);
registerModel('Event', eventSchema);
module.exports = eventSchema;
