'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const idParamSchema = Joi.object({ id: objectId.required() });

const createSchema = Joi.object({
  leaveType: Joi.string().valid('sick', 'family', 'travel', 'other').required(),
  fromDate: Joi.date().required(),
  toDate: Joi.date().required(),
  reason: Joi.string().trim().min(1).required(),
});

const decideSchema = Joi.object({
  remarks: Joi.string().trim().allow('', null),
});

module.exports = { idParamSchema, createSchema, decideSchema };
