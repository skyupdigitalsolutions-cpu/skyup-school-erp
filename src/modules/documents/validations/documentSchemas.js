'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

// A teacher may only author their OWN categories — policy/circular/training
// are school-issued and structurally impossible to submit through these
// endpoints (same allow-list discipline as the My Profile page).
const TEACHER_CATEGORIES = ['personal', 'certificate'];
const ALL_CATEGORIES = ['personal', 'certificate', 'policy', 'circular', 'training'];

const createSchema = Joi.object({
  title: Joi.string().trim().max(200).required(),
  category: Joi.string().valid(...TEACHER_CATEGORIES).required(),
  url: Joi.string().uri().allow('', null),
  description: Joi.string().trim().max(2000).allow('', null),
  expiryDate: Joi.date().allow(null),
})
  .or('url', 'description')
  .messages({ 'object.missing': 'Provide a link or a description for this document.' });

const updateSchema = Joi.object({
  title: Joi.string().trim().max(200),
  category: Joi.string().valid(...TEACHER_CATEGORIES),
  url: Joi.string().uri().allow('', null),
  description: Joi.string().trim().max(2000).allow('', null),
  expiryDate: Joi.date().allow(null),
}).min(1);

const idParamSchema = Joi.object({ id: objectId.required() });

const listQuery = Joi.object({
  category: Joi.string().valid(...ALL_CATEGORIES).allow('', null),
});

module.exports = { createSchema, updateSchema, idParamSchema, listQuery, TEACHER_CATEGORIES, ALL_CATEGORIES };
