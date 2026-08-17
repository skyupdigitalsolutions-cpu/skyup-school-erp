'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const createSubjectSchema = Joi.object({
  name: Joi.string().trim().max(120).required(),
  code: Joi.string().trim().max(20).required(),
  grades: Joi.array().items(Joi.string().trim()).min(1).required(),
  description: Joi.string().trim().max(500).allow('', null),
  status: Joi.string().valid('active', 'inactive').default('active'),
});

const updateSubjectSchema = createSubjectSchema.fork(
  ['name', 'code', 'grades'],
  (s) => s.optional()
);

const idParamSchema = Joi.object({ id: objectId.required() });
const topicIdParamSchema = Joi.object({ id: objectId.required(), topicId: objectId.required() });

const listSubjectQuery = Joi.object({
  q: Joi.string().trim().allow('', null),
  grade: Joi.string().trim().allow('', null),
  status: Joi.string().valid('active', 'inactive').allow('', null),
  page: Joi.number().integer().min(1),
  limit: Joi.number().integer().min(1).max(100),
});

const topicTreeQuery = Joi.object({
  grade: Joi.string().trim().required(),
  academicYear: Joi.string().trim().allow('', null),
});

const createTopicSchema = Joi.object({
  academicYear: Joi.string().trim().required(),
  grade: Joi.string().trim().required(),
  parent: objectId.allow(null),
  title: Joi.string().trim().max(200).required(),
  sequence: Joi.number().integer().min(0).default(0),
  plannedPeriods: Joi.number().integer().min(1).default(1),
});

const updateTopicSchema = createTopicSchema.fork(
  ['academicYear', 'grade', 'title'],
  (s) => s.optional()
);

module.exports = {
  createSubjectSchema,
  updateSubjectSchema,
  idParamSchema,
  topicIdParamSchema,
  listSubjectQuery,
  topicTreeQuery,
  createTopicSchema,
  updateTopicSchema,
};
