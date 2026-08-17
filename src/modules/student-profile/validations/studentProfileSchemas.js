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

const contact = Joi.object({
  phone: Joi.string().trim().max(20).allow('', null),
  email: Joi.string().trim().email().allow('', null),
});

/**
 * Parent-editable allow-list — ONLY these fields. Validated with
 * `stripUnknown: false` (see routes/index.js), so class, section, rollNo,
 * admissionNo, feeStatus, marks, ids, etc. are REJECTED as unknown keys, not
 * silently dropped. A student viewer never reaches this schema at all — the
 * route gates the whole PATCH to parent-only before validation runs.
 */
const updateMeSchema = Joi.object({
  parent: Joi.object({
    father: contact,
    mother: contact,
    guardian: contact,
  }),
  personal: Joi.object({
    address,
  }),
  medical: Joi.object({
    emergencyContact: Joi.string().trim().max(20).allow('', null),
  }),
}).min(1);

module.exports = { updateMeSchema };
