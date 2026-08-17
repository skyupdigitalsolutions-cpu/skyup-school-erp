'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const idParamSchema = Joi.object({ id: objectId.required() });

const createSchema = Joi.object({
  category: Joi.string().valid('maintenance', 'infrastructure', 'stationery', 'cca').required(),
  subCategory: Joi.string().trim().allow('', null),
  amount: Joi.number().positive().required(),
  academicYear: Joi.string().required(),
  date: Joi.date().optional(),
  vendor: Joi.string().trim().allow('', null),
  paymentMode: Joi.string().valid('cash', 'cheque', 'online', 'card', 'upi').allow(null),
  transactionRef: Joi.string().trim().allow('', null),
  remarks: Joi.string().trim().allow('', null),
});

const reverseSchema = Joi.object({
  remarks: Joi.string().trim().allow('', null),
});

module.exports = { idParamSchema, createSchema, reverseSchema };
