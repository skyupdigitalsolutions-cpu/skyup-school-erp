'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const caretakerSchema = new mongoose.Schema({
  caretakerId: { type: String, required: true, unique: true, trim: true },
  photo: { type: String, default: null },
  status: { type: String, enum: ['active','inactive','suspended','archived'], default: 'active', index: true },
  verificationStatus: { type: String, enum: ['verified','pending','rejected'], default: 'pending' },
  employmentType: { type: String, enum: ['full_time','part_time','contract','volunteer'], default: 'full_time' },

  personal: {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: Date, default: null },
    gender: { type: String, enum: ['male','female','other'], default: null },
    bloodGroup: { type: String, enum: ['A+','A-','B+','B-','AB+','AB-','O+','O-',null], default: null },
    relationship: { type: String, default: null }, // e.g. parent, guardian, driver
    phone: { type: String, required: true },
    email: { type: String, lowercase: true, trim: true, default: null },
    address: { line1: String, line2: String, city: String, state: String, pincode: String, country: { type: String, default: 'India' } },
    emergencyContact: { name: String, phone: String, relation: String },
  },

  identityProofs: {
    aadhaar: { number: String, verified: { type: Boolean, default: false }, docUrl: String },
    pan: { number: String, verified: { type: Boolean, default: false }, docUrl: String },
    drivingLicense: { number: String, expiryDate: Date, verified: { type: Boolean, default: false }, docUrl: String },
    policeVerification: { status: String, date: Date, docUrl: String },
    medicalCertificate: { date: Date, validTill: Date, docUrl: String },
    addressProof: { type: String, docUrl: String },
  },

  assignedStudents: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    admissionNo: String,
    name: String,
    class: String,
    section: String,
    rollNo: String,
    pickupPoint: String,
    dropPoint: String,
    route: String,
    parentPhone: String,
  }],

  vehicleDetails: {
    vehicleNumber: String,
    model: String,
    registration: String,
    driver: String,
    route: String,
    gpsStatus: { type: String, enum: ['active','inactive','unknown'], default: 'unknown' },
    capacity: { type: Number, default: 0 },
  },

  attendanceSummary: {
    totalDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
  },

  documents: [{ name: String, type: String, url: String, uploadedAt: { type: Date, default: Date.now } }],

  aiInsights: {
    summary: String,
    attendanceTrends: String,
    latePickupAlerts: [String],
    documentExpiryAlerts: [String],
    safetyAlerts: [String],
    generatedAt: Date,
  },

  loginEnabled: { type: Boolean, default: false },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

caretakerSchema.index({ 'personal.firstName': 'text', 'personal.lastName': 'text', caretakerId: 'text', 'personal.phone': 'text' });
caretakerSchema.index({ status: 1, verificationStatus: 1 });
caretakerSchema.plugin(baseSchemaPlugin);
caretakerSchema.virtual('fullName').get(function() { return `${this.personal.firstName} ${this.personal.lastName}`; });
registerModel('Caretaker', caretakerSchema);
module.exports = caretakerSchema;
