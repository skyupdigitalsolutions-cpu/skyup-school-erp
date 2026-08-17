'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const resourceSchema = Joi.object({
  title: Joi.string().trim().max(150).required(),
  url: Joi.string().uri().required(),
});

const createSchema = Joi.object({
  class: objectId.required(),
  section: Joi.string().trim().required(),
  subject: objectId.required(),
  date: Joi.date().required(),
  title: Joi.string().trim().max(200).required(),
  learningObjectives: Joi.string().trim().max(2000).allow('', null),
  teachingMethod: Joi.string().trim().max(500).allow('', null),
  activities: Joi.string().trim().max(2000).allow('', null),
  assessmentMethod: Joi.string().trim().max(500).allow('', null),
  topics: Joi.array().items(objectId).default([]),
  resources: Joi.array().items(resourceSchema).default([]),
  status: Joi.string().valid('draft', 'submitted').default('draft'),
});

// class/section/subject are immutable after creation, same as Homework.
const updateSchema = Joi.object({
  date: Joi.date(),
  title: Joi.string().trim().max(200),
  learningObjectives: Joi.string().trim().max(2000).allow('', null),
  teachingMethod: Joi.string().trim().max(500).allow('', null),
  activities: Joi.string().trim().max(2000).allow('', null),
  assessmentMethod: Joi.string().trim().max(500).allow('', null),
  topics: Joi.array().items(objectId),
  resources: Joi.array().items(resourceSchema),
  status: Joi.string().valid('draft', 'submitted'),
}).min(1);

const reviewSchema = Joi.object({
  status: Joi.string().valid('approved', 'needs_revision').required(),
  reviewNote: Joi.string().trim().max(1000).allow('', null),
});

const idParamSchema = Joi.object({ id: objectId.required() });

const listQuery = Joi.object({
  from: Joi.date().allow('', null),
  to: Joi.date().allow('', null),
  classId: objectId.allow('', null),
  status: Joi.string().valid('all', 'draft', 'submitted', 'approved', 'needs_revision').allow('', null),
});

module.exports = { createSchema, updateSchema, reviewSchema, idParamSchema, listQuery };
