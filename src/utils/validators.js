'use strict';

const Joi = require('joi');

/**
 * Shared ObjectId validator — same hex/length check used across module
 * validation schemas (see principalSchemas.js), pulled out so new modules
 * don't have to redefine it.
 */
const objectId = Joi.string().hex().length(24).messages({
  'string.hex': '{{#label}} must be a valid ObjectId',
  'string.length': '{{#label}} must be a valid ObjectId',
});

module.exports = { objectId };
