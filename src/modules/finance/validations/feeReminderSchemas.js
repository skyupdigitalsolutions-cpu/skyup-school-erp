'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const dueQuerySchema = Joi.object({
  month: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
});

const bulkSendSchema = Joi.object({
  studentIds: Joi.array().items(objectId).min(1).required(),
  month: Joi.string().pattern(/^\d{4}-\d{2}$/).optional(),
});

module.exports = { dueQuerySchema, bulkSendSchema };
