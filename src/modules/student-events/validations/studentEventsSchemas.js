'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const idParamSchema = Joi.object({ id: objectId.required() });

module.exports = { idParamSchema };
