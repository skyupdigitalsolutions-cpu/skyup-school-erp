'use strict';
const Joi = require('joi');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = Joi.string().pattern(DATE_RE).messages({ 'string.pattern.base': '{{#label}} must be YYYY-MM-DD' });

const rangeQuery = Joi.object({
  from: isoDate.required(),
  to: isoDate.required(),
});

module.exports = { rangeQuery };
