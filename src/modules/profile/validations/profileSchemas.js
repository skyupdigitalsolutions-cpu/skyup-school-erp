'use strict';
const Joi = require('joi');

const address = Joi.object({
  line1: Joi.string().trim().max(200).allow('', null),
  line2: Joi.string().trim().max(200).allow('', null),
  city: Joi.string().trim().max(100).allow('', null),
  state: Joi.string().trim().max(100).allow('', null),
  pincode: Joi.string().trim().max(10).allow('', null),
  country: Joi.string().trim().max(100).allow('', null),
});

const emergencyContact = Joi.object({
  name: Joi.string().trim().max(100).allow('', null),
  phone: Joi.string().trim().max(20).allow('', null),
  relation: Joi.string().trim().max(50).allow('', null),
});

/**
 * Self-editable allow-list — ONLY these fields. This is validated with
 * `stripUnknown: false` (see routes/index.js), so anything not listed here —
 * employeeId, professional.*, qualifications, assignedSubjects, payroll,
 * status, userId, etc. — is REJECTED as an unknown key, not silently dropped.
 */
const updateMeSchema = Joi.object({
  photo: Joi.string().uri().allow('', null),
  personal: Joi.object({
    phone: Joi.string().trim().max(20),
    address,
    emergencyContact,
  }),
}).min(1);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: Joi.string().min(8).max(128).required(),
  confirmPassword: Joi.string().valid(Joi.ref('newPassword')).required().messages({
    'any.only': 'Passwords do not match.',
  }),
});

module.exports = { updateMeSchema, changePasswordSchema };
