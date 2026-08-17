'use strict';
const Joi = require('joi');
const { objectId } = require('../../../utils/validators');

const examIdParamSchema = Joi.object({ examId: objectId.required() });

module.exports = { examIdParamSchema };
