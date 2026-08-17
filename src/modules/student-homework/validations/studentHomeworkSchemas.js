'use strict';
const Joi = require('joi');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isoDate = Joi.string().pattern(DATE_RE).messages({ 'string.pattern.base': '{{#label}} must be YYYY-MM-DD' });

const listQuery = Joi.object({
  status: Joi.string().valid('all', 'pending', 'submitted', 'graded', 'overdue').allow('', null),
  from: isoDate.allow('', null),
  to: isoDate.allow('', null),
});

module.exports = { listQuery };
