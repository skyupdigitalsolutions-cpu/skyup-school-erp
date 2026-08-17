'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

/**
 * BehaviourNote — the class teacher's one log for both "Student Behaviour"
 * (student set) and "Class Remarks" (student null = a general note about the
 * whole class). Distinct from the older `Student.behaviourNotes[]` embedded
 * array (principal-only, positive/negative/neutral taxonomy, no class ref
 * and no way to represent a class-level note) — this is a fresh, purpose-built
 * collection for the class-teacher's own log.
 */
const behaviourNoteSchema = new mongoose.Schema(
  {
    class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
    section: { type: String, required: true, trim: true },
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
    date: { type: Date, default: Date.now },
    type: { type: String, enum: ['praise', 'concern', 'incident'], required: true },
    note: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true }
);

behaviourNoteSchema.index({ class: 1, section: 1, date: -1 });
behaviourNoteSchema.index({ student: 1, date: -1 });

behaviourNoteSchema.plugin(baseSchemaPlugin);
registerModel('BehaviourNote', behaviourNoteSchema);
module.exports = behaviourNoteSchema;
