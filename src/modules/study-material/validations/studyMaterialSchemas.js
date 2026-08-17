'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const TYPES = ['notes', 'pdf', 'video', 'ppt', 'worksheet', 'question_bank', 'previous_paper'];

const createSchema = Joi.object({
  class: objectId.required(),
  section: Joi.string().trim().required(),
  subject: objectId.required(),
  topic: objectId.allow(null),
  title: Joi.string().trim().max(200).required(),
  type: Joi.string().valid(...TYPES).required(),
  url: Joi.string().uri().allow('', null),
  description: Joi.string().trim().max(2000).allow('', null),
  visibility: Joi.string().valid('private', 'class', 'school').default('private'),
})
  .or('url', 'description')
  .messages({ 'object.missing': 'Provide a link or a description for this material.' });

// class/section/subject are immutable after creation, same as Homework/LessonPlan.
const updateSchema = Joi.object({
  topic: objectId.allow(null),
  title: Joi.string().trim().max(200),
  type: Joi.string().valid(...TYPES),
  url: Joi.string().uri().allow('', null),
  description: Joi.string().trim().max(2000).allow('', null),
  visibility: Joi.string().valid('private', 'class', 'school'),
}).min(1);

const idParamSchema = Joi.object({ id: objectId.required() });

const listQuery = Joi.object({
  type: Joi.string().valid(...TYPES).allow('', null),
  subject: objectId.allow('', null),
  classId: objectId.allow('', null),
});

module.exports = { createSchema, updateSchema, idParamSchema, listQuery, TYPES };
