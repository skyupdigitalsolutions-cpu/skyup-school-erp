'use strict';
const mongoose = require('mongoose');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const classSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  sections: [{ type: String, trim: true }],
  academicYear: { type: String, required: true, trim: true },
  classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', default: null },
  subjects: [{ type: String, trim: true }],
  capacity: { type: Number, default: 40 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, { timestamps: true });

classSchema.index({ name: 1, academicYear: 1 }, { unique: true });
classSchema.plugin(baseSchemaPlugin);
registerModel('Class', classSchema);
module.exports = classSchema;