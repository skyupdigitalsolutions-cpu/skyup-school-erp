'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const createSchema = Joi.object({
  class: objectId.required(),
  section: Joi.string().trim().required(),
  subject: objectId.required(),
  title: Joi.string().trim().max(200).required(),
  description: Joi.string().trim().max(2000).allow('', null),
  attachmentUrl: Joi.string().uri().allow('', null),
  dueDate: Joi.date().required(),
  maxMarks: Joi.number().min(0).allow(null),
  submissionType: Joi.string().valid('online', 'physical').default('physical'),
  status: Joi.string().valid('draft', 'assigned').default('draft'),
});

const updateSchema = Joi.object({
  title: Joi.string().trim().max(200),
  description: Joi.string().trim().max(2000).allow('', null),
  attachmentUrl: Joi.string().uri().allow('', null),
  dueDate: Joi.date(),
  maxMarks: Joi.number().min(0).allow(null),
  submissionType: Joi.string().valid('online', 'physical'),
  status: Joi.string().valid('draft', 'assigned'),
}).min(1);

const gradeSchema = Joi.object({
  status: Joi.string().valid('submitted', 'late', 'graded').required(),
  marks: Joi.number().min(0).allow(null),
  feedback: Joi.string().trim().max(1000).allow('', null),
});

const idParamSchema = Joi.object({ id: objectId.required() });
const studentGradeParamSchema = Joi.object({ id: objectId.required(), studentId: objectId.required() });

const listQuery = Joi.object({
  status: Joi.string().valid('all', 'draft', 'scheduled', 'history').allow('', null),
  classId: objectId.allow('', null),
});

module.exports = { createSchema, updateSchema, gradeSchema, idParamSchema, studentGradeParamSchema, listQuery };
