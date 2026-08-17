'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const STATUSES = ['present', 'absent', 'late', 'excused', 'holiday'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = Joi.string().pattern(DATE_RE).messages({ 'string.pattern.base': '{{#label}} must be YYYY-MM-DD' });

const classSectionParamSchema = Joi.object({
  classId: objectId.required(),
  section: Joi.string().trim().required(),
});

const rosterQuery = Joi.object({
  date: isoDate.required(),
});

const markAttendanceSchema = Joi.object({
  classId: objectId.required(),
  section: Joi.string().trim().required(),
  date: isoDate.required(),
  period: Joi.number().integer().min(1).max(12).allow(null),
  records: Joi.array()
    .items(
      Joi.object({
        studentId: objectId.required(),
        status: Joi.string().valid(...STATUSES).required(),
        remarks: Joi.string().trim().max(300).allow('', null),
      })
    )
    .min(1)
    .required(),
});

const studentIdParamSchema = Joi.object({ studentId: objectId.required() });

const summaryQuery = Joi.object({
  from: isoDate.required(),
  to: isoDate.required(),
});

module.exports = {
  classSectionParamSchema,
  rosterQuery,
  markAttendanceSchema,
  studentIdParamSchema,
  summaryQuery,
};
