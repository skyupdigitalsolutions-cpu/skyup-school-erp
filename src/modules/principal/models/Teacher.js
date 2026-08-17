'use strict';

const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * Teacher schema — covers every section in the Principal module's
 * Teacher Management requirements:
 *   Personal · Professional · Qualification · Classes & Subjects ·
 *   Attendance · Leave · Payroll (snapshot) · Performance · Assets ·
 *   Documents · Activity Timeline · AI Insights
 */
const teacherSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    employeeId: { type: String, required: true, unique: true, trim: true },
    photo: { type: String, default: null },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on_leave', 'suspended', 'resigned', 'archived'],
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
      phone: { type: String, required: true },
      email: { type: String, lowercase: true, trim: true, required: true },
      emergencyContact: {
        name: String,
        phone: String,
        relation: String,
      },
      address: {
        line1: String,
        line2: String,
        city: String,
        state: String,
        pincode: String,
        country: { type: String, default: 'India' },
      },
    },

    // ── Professional Details ──────────────────────────────────────────────────
    professional: {
      department: { type: String, required: true, index: true },
      designation: { type: String, required: true },
      employmentType: {
        type: String,
        enum: ['permanent', 'contract', 'part_time', 'visiting'],
        default: 'permanent',
      },
      joiningDate: { type: Date, default: Date.now },
      relievingDate: { type: Date, default: null },
      experienceYears: { type: Number, default: 0 },
    },

    // ── Qualifications ────────────────────────────────────────────────────────
    qualifications: [
      {
        degree: String,
        specialization: String,
        institution: String,
        yearOfPassing: Number,
        grade: String,
      },
    ],

    // ── Classes & Subjects ────────────────────────────────────────────────────
    assignedSubjects: [
      {
        subject: String,
        class: String,
        section: String,
        academicYear: String,
        isClassTeacher: { type: Boolean, default: false },
      },
    ],

    // ── Attendance Summary (denormalised snapshot) ────────────────────────────
    attendanceSummary: {
      totalDays: { type: Number, default: 0 },
      presentDays: { type: Number, default: 0 },
      percentage: { type: Number, default: 0 },
      lastUpdated: { type: Date, default: null },
    },

    // ── Leave Summary ─────────────────────────────────────────────────────────
    leaveSummary: {
      totalLeaves: { type: Number, default: 0 },
      usedLeaves: { type: Number, default: 0 },
      pendingLeaves: { type: Number, default: 0 },
    },

    // ── Payroll Snapshot ──────────────────────────────────────────────────────
    payroll: {
      basicSalary: { type: Number, default: 0 },
      grossSalary: { type: Number, default: 0 },
      bankName: { type: String, default: null },
      accountNo: { type: String, default: null },
      ifscCode: { type: String, default: null },
      lastPaidMonth: { type: String, default: null },
      lastPaidAmount: { type: Number, default: 0 },
    },

    // ── Performance ───────────────────────────────────────────────────────────
    performance: {
      lastRating: { type: Number, min: 0, max: 5, default: null },
      lastReviewDate: { type: Date, default: null },
      reviews: [
        {
          date: Date,
          rating: Number,
          remarks: String,
          reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        },
      ],
    },

    // ── Assets ────────────────────────────────────────────────────────────────
    assets: [
      {
        assetName: String,
        assetId: String,
        assignedDate: Date,
        returnedDate: { type: Date, default: null },
        status: { type: String, enum: ['assigned', 'returned', 'lost'], default: 'assigned' },
      },
    ],

    // ── Documents ─────────────────────────────────────────────────────────────
    documents: [
      {
        name: String,
        type: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ── AI Insights ───────────────────────────────────────────────────────────
    aiInsights: {
      summary: { type: String, default: null },
      strengths: [String],
      areasOfImprovement: [String],
      generatedAt: { type: Date, default: null },
    },

    // ── Login ─────────────────────────────────────────────────────────────────
    loginEnabled: { type: Boolean, default: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

teacherSchema.index({
  'personal.firstName': 'text',
  'personal.lastName': 'text',
  employeeId: 'text',
  'personal.email': 'text',
});
teacherSchema.index({ 'professional.department': 1, status: 1 });

teacherSchema.plugin(baseSchemaPlugin);

teacherSchema.virtual('fullName').get(function () {
  return `${this.personal.firstName} ${this.personal.lastName}`;
});

registerModel('Teacher', teacherSchema);

module.exports = teacherSchema;
