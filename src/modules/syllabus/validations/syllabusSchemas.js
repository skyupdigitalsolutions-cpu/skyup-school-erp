'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const classSectionParamSchema = Joi.object({
  classId: objectId.required(),
  section: Joi.string().trim().required(),
});

const progressQuery = Joi.object({
  academicYear: Joi.string().trim().allow('', null),
});

const markProgressSchema = Joi.object({
  academicYear: Joi.string().trim().required(),
  class: objectId.required(),
  section: Joi.string().trim().required(),
  topic: objectId.required(),
  status: Joi.string().valid('not_started', 'in_progress', 'completed').required(),
  completedOn: Joi.date().allow(null),
});

module.exports = { classSectionParamSchema, progressQuery, markProgressSchema };
