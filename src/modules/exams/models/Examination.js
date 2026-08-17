'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const examinationSchema = new mongoose.Schema({
  examId: { type: String, required: true, unique: true, trim: true },
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, default: null },
  type: { type: String, enum: ['unit_test','mid_term','final','annual','mock','competitive','internal'], required: true },
  academicYear: { type: String, required: true, index: true },
  term: { type: String, default: null }, // Term 1, Term 2, etc.
  description: { type: String, default: null },
  status: { type: String, enum: ['draft','scheduled','ongoing','evaluation','completed','cancelled'], default: 'draft', index: true },

  classAllocations: [{ class: String, sections: [String] }],

  timetable: [{
    date: Date,
    subject: String,
    class: String,
    section: String,
    startTime: String,
    endTime: String,
    duration: Number, // minutes
    room: String,
    invigilators: [{ name: String, employeeId: String }],
    maxMarks: { type: Number, default: 100 },
    passingMarks: { type: Number, default: 35 },
  }],

  subjectScheme: [{
    subject: String,
    class: String,
    maxMarks: Number,
    passingMarks: Number,
    theoryMarks: Number,
    practicalMarks: Number,
    internalMarks: Number,
  }],

  rooms: [{ roomNo: String, capacity: Number, block: String, invigilator: String }],

  attendance: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    admissionNo: String,
    name: String,
    class: String,
    section: String,
    status: { type: String, enum: ['present','absent','medical','malpractice'], default: 'present' },
    subject: String,
    date: Date,
    remarks: String,
  }],

  marks: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    admissionNo: String,
    name: String,
    class: String,
    section: String,
    subject: String,
    marksObtained: { type: Number, default: 0 },
    maxMarks: { type: Number, default: 100 },
    grade: String,
    remarks: String,
    moderated: { type: Boolean, default: false },
    moderationRemarks: String,
  }],

  results: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    admissionNo: String,
    name: String,
    class: String,
    section: String,
    totalMarks: Number,
    maxTotalMarks: Number,
    percentage: Number,
    gpa: Number,
    rank: Number,
    grade: String,
    status: { type: String, enum: ['pass','fail','withheld','absent'], default: 'pass' },
    subjectWise: [{ subject: String, marks: Number, maxMarks: Number, grade: String, status: String }],
    published: { type: Boolean, default: false },
    publishedAt: Date,
  }],

  hallTickets: [{
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    admissionNo: String,
    name: String,
    class: String,
    section: String,
    rollNo: String,
    generated: { type: Boolean, default: false },
    generatedAt: Date,
    url: String,
  }],

  documents: [{ name: String, type: String, url: String, uploadedAt: { type: Date, default: Date.now } }],

  aiInsights: {
    performanceTrends: String,
    weakSubjects: [String],
    topperAnalysis: String,
    recommendations: [String],
    generatedAt: Date,
  },
}, { timestamps: true });

examinationSchema.index({ academicYear: 1, status: 1 });
examinationSchema.index({ name: 'text', examId: 'text' });
examinationSchema.plugin(baseSchemaPlugin);
registerModel('Examination', examinationSchema);
module.exports = examinationSchema;
