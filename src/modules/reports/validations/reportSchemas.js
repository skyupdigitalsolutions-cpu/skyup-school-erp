'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const teacherReportQuery = Joi.object({
  type: Joi.string().valid('attendance', 'homework', 'syllabus', 'behaviour', 'exams').required(),
  from: Joi.date().allow('', null),
  to: Joi.date().allow('', null),
  classId: objectId.allow('', null),
});

module.exports = { teacherReportQuery };
