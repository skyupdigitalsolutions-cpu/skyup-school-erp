'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const idParamSchema = Joi.object({ id: objectId.required() });

const startTripSchema = Joi.object({
  route: Joi.string().trim().min(1).required(),
  direction: Joi.string().valid('pickup', 'drop').required(),
  date: Joi.date().optional(),
});

const studentLogSchema = Joi.object({
  studentId: objectId.required(),
  action: Joi.string().valid('picked_up', 'dropped', 'absent').required(),
});

const tripsQuerySchema = Joi.object({
  date: Joi.date().optional(),
});

// Allow-list only — stripUnknown:false at the route means anything outside
// this shape (route/vehicle assignment, verification status, documents...)
// is REJECTED, not silently dropped. Same discipline as the teacher's own
// PATCH /profile/me.
const updateProfileSchema = Joi.object({
  personal: Joi.object({
    phone: Joi.string().trim().max(20),
    email: Joi.string().trim().email().allow('', null),
  }),
}).min(1);

module.exports = { idParamSchema, startTripSchema, studentLogSchema, tripsQuerySchema, updateProfileSchema };
