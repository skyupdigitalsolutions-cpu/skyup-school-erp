'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const EXAM_TYPES = ['unit_test', 'midterm', 'final', 'other'];
const EXAM_STATUSES = ['draft', 'scheduled', 'ongoing', 'completed', 'results_published'];

const createExamSchema = Joi.object({
  title: Joi.string().trim().max(200).required(),
  academicYear: Joi.string().trim().required(),
  type: Joi.string().valid(...EXAM_TYPES).default('unit_test'),
  classes: Joi.array().items(objectId).min(1).required(),
  startDate: Joi.date().allow(null),
  endDate: Joi.date().allow(null),
});

const updateExamSchema = Joi.object({
  title: Joi.string().trim().max(200),
  academicYear: Joi.string().trim(),
  type: Joi.string().valid(...EXAM_TYPES),
  classes: Joi.array().items(objectId).min(1),
  startDate: Joi.date().allow(null),
  endDate: Joi.date().allow(null),
}).min(1);

const statusSchema = Joi.object({
  status: Joi.string().valid(...EXAM_STATUSES).required(),
});

const createScheduleSchema = Joi.object({
  class: objectId.required(),
  section: Joi.string().trim().required(),
  subject: objectId.required(),
  date: Joi.date().required(),
  startTime: Joi.string().trim().allow('', null),
  endTime: Joi.string().trim().allow('', null),
  room: Joi.string().trim().allow('', null),
  maxMarks: Joi.number().min(1).required(),
});

const updateScheduleSchema = Joi.object({
  date: Joi.date(),
  startTime: Joi.string().trim().allow('', null),
  endTime: Joi.string().trim().allow('', null),
  room: Joi.string().trim().allow('', null),
  maxMarks: Joi.number().min(1),
}).min(1);

const marksEntrySchema = Joi.object({
  records: Joi.array()
    .items(
      Joi.object({
        studentId: objectId.required(),
        marksObtained: Joi.number().min(0).allow(null),
        isAbsent: Joi.boolean().default(false),
        remarks: Joi.string().trim().max(300).allow('', null),
      })
    )
    .min(1)
    .required(),
});

const idParamSchema = Joi.object({ id: objectId.required() });
const scheduleIdParamSchema = Joi.object({ scheduleId: objectId.required() });

module.exports = {
  createExamSchema,
  updateExamSchema,
  statusSchema,
  createScheduleSchema,
  updateScheduleSchema,
  marksEntrySchema,
  idParamSchema,
  scheduleIdParamSchema,
};
