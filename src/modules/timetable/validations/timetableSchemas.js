'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const entrySchema = Joi.object({
  academicYear: Joi.string().trim().required(),
  class: objectId.required(),
  section: Joi.string().trim().required(),
  subject: objectId.required(),
  staff: objectId.required(),
  dayOfWeek: Joi.number().integer().min(0).max(6).required(),
  period: Joi.number().integer().min(1).max(12).required(),
  room: Joi.string().trim().max(50).allow('', null),
});

const bulkEntrySchema = Joi.object({
  entries: Joi.array().items(entrySchema).min(1).required(),
});

const classSectionParamSchema = Joi.object({
  classId: objectId.required(),
  section: Joi.string().trim().required(),
});

const classSectionQuery = Joi.object({
  academicYear: Joi.string().trim().allow('', null),
});

module.exports = { entrySchema, bulkEntrySchema, classSectionParamSchema, classSectionQuery };
