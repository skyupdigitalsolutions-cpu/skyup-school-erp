'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const rangeQuery = Joi.object({
  from: Joi.date().required(),
  to: Joi.date().required(),
});

const createReminderSchema = Joi.object({
  title: Joi.string().trim().max(200).required(),
  date: Joi.date().required(),
  note: Joi.string().trim().max(1000).allow('', null),
});

const updateReminderSchema = Joi.object({
  title: Joi.string().trim().max(200),
  date: Joi.date(),
  note: Joi.string().trim().max(1000).allow('', null),
}).min(1);

const idParamSchema = Joi.object({ id: objectId.required() });

module.exports = { rangeQuery, createReminderSchema, updateReminderSchema, idParamSchema };
