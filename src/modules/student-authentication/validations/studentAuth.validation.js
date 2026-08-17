'use strict';
const Joi = require('joi');

const loginSchema = {
  body: Joi.object({
    email: Joi.string().email().lowercase().trim().required().messages({
      'string.email': 'Enter a valid email address.',
      'any.required': 'Email is required.',
    }),
    password: Joi.string().min(8).max(128).required().messages({
      'string.min': 'Password must be at least 8 characters.',
      'any.required': 'Password is required.',
    }),
  }),
};

module.exports = { loginSchema };
