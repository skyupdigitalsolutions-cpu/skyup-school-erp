'use strict';
const Joi = require('joi');
const { ROLE_VALUES } = require('../../../utils/constants');

const roleParamSchema = Joi.object({ role: Joi.string().valid(...ROLE_VALUES).required() });

const updateRoleSchema = Joi.object({
  permissions: Joi.array().items(Joi.string()).required(),
});

module.exports = { roleParamSchema, updateRoleSchema };
