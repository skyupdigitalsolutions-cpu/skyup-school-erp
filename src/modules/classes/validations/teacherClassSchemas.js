'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const classIdParamSchema = Joi.object({ classId: objectId.required() });

const classStudentParamSchema = Joi.object({
  classId: objectId.required(),
  studentId: objectId.required(),
});

// `section` is a query param (not a path segment) because a Class document
// can carry multiple sections — see TeacherClassService for why classId alone
// isn't enough to identify a roster.
const sectionQuery = Joi.object({
  section: Joi.string().trim().required(),
});

module.exports = { classIdParamSchema, classStudentParamSchema, sectionQuery };
