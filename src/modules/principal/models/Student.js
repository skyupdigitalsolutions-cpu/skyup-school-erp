'use strict';

const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Student schema — covers every section shown in the Principal module's
 * Student Management requirements:
 *   Personal Info · Academic Details · Parent Details · Attendance Summary ·
 *   Exam Performance · Fee Status · Transport · Library · Medical · Behaviour ·
 *   Awards · Timeline · Documents
 */
const studentSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    admissionNo: { type: String, required: true, unique: true, trim: true },
    rollNo: { type: String, trim: true, default: null },
    photo: { type: String, default: null }, // Cloudinary URL
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended', 'transferred', 'archived', 'alumni'],
      default: 'active',
      index: true,
    },

    // ── Personal Information ──────────────────────────────────────────────────
    personal: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      dateOfBirth: { type: Date, default: null },
      gender: { type: String, enum: ['male', 'female', 'other'], default: null },
      bloodGroup: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null],
        default: null,
      },
      nationality: { type: String, default: null },
      religion: { type: String, default: null },
      address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        pincode: String,
        country: { type: String, default: 'India' },
      },
      phone: { type: String, default: null },
      email: { type: String, lowercase: true, trim: true, default: null },
    },

    // ── Academic Details ──────────────────────────────────────────────────────
    academic: {
      academicYear: { type: String, required: true }, // e.g. "2024-25"
      class: { type: String, required: true },
      section: { type: String, required: true },
      house: { type: String, default: null },
      admissionDate: { type: Date, default: Date.now },
      subjects: [{ type: String }],
    },

    // ── Parent / Guardian Details ─────────────────────────────────────────────
    parent: {
      father: {
        name: String,
        phone: String,
        email: String,
        occupation: String,
      },
      mother: {
        name: String,
        phone: String,
        email: String,
        occupation: String,
      },
      guardian: {
        name: String,
        phone: String,
        email: String,
        relation: String,
      },
      primaryContact: { type: String, enum: ['father', 'mother', 'guardian'], default: 'father' },
    },

    // ── Attendance Summary (denormalised snapshot) ────────────────────────────
    attendanceSummary: {
      totalDays: { type: Number, default: 0 },
      presentDays: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: null },
    },

    // ── Fee Status (snapshot; full ledger lives in fee-management module) ─────
    feeStatus: {
      totalFee: { type: Number, default: 0 },
      paidAmount: { type: Number, default: 0 },
      dueAmount: { type: Number, default: 0 },
      lastPaidDate: { type: Date, default: null },
      status: { type: String, enum: ['paid', 'partial', 'due', 'overdue'], default: 'due' },
    },

    // ── Transport ─────────────────────────────────────────────────────────────
    transport: {
      enrolled: { type: Boolean, default: false },
      routeNo: { type: String, default: null },
      stopName: { type: String, default: null },
      vehicleNo: { type: String, default: null },
    },

    // ── Library ───────────────────────────────────────────────────────────────
    library: {
      cardNo: { type: String, default: null },
      booksIssued: { type: Number, default: 0 },
      hasOverdue: { type: Boolean, default: false },
    },

    // ── Medical Alerts ────────────────────────────────────────────────────────
    medical: {
      allergies: [{ type: String }],
      conditions: [{ type: String }],
      medications: [{ type: String }],
      emergencyContact: { type: String, default: null },
      notes: { type: String, default: null },
    },

    // ── Behaviour Notes ───────────────────────────────────────────────────────
    behaviourNotes: [
      {
        date: { type: Date, default: Date.now },
        note: String,
        type: { type: String, enum: ['positive', 'negative', 'neutral'], default: 'neutral' },
        recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      },
    ],

    // ── Awards & Achievements ─────────────────────────────────────────────────
    awards: [
      {
        title: String,
        description: String,
        date: { type: Date, default: Date.now },
        category: String,
      },
    ],

    // ── Uploaded Documents ────────────────────────────────────────────────────
    documents: [
      {
        name: String,
        type: String, // e.g. "birth_certificate", "transfer_certificate"
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ── Hostel ───────────────────────────────────────────────────────────────
    hostel: {
      enrolled: { type: Boolean, default: false },
      hostelName: { type: String, default: null },
      roomNo: { type: String, default: null },
    },

    // ── Login / Portal Access ─────────────────────────────────────────────────
    loginEnabled: { type: Boolean, default: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Compound indexes for common query patterns
studentSchema.index({ 'academic.academicYear': 1, 'academic.class': 1, 'academic.section': 1 });
studentSchema.index({ 'personal.firstName': 'text', 'personal.lastName': 'text', admissionNo: 'text' });
studentSchema.index({ status: 1, 'academic.academicYear': 1 });

studentSchema.plugin(baseSchemaPlugin);

// Virtual: full name
studentSchema.virtual('fullName').get(function () {
  return `${this.personal.firstName} ${this.personal.lastName}`;
});

registerModel('Student', studentSchema);

module.exports = studentSchema;
