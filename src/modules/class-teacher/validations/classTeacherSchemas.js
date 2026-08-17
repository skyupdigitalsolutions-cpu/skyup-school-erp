'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const studentIdParam = Joi.object({ studentId: objectId.required() });

const behaviourListQuery = Joi.object({
  studentId: objectId.allow('', null),
});

const behaviourCreateSchema = Joi.object({
  studentId: objectId.allow(null),
  type: Joi.string().valid('praise', 'concern', 'incident').required(),
  note: Joi.string().trim().max(2000).required(),
  date: Joi.date().allow(null),
});

module.exports = { studentIdParam, behaviourListQuery, behaviourCreateSchema };
