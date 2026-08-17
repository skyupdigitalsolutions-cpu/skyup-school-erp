'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/SyllabusController');
const V = require('../validations/syllabusSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const staffAccess = requireRoles(ROLES.TEACHER, ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

router.get(
  '/progress/:classId/:section',
  staffAccess,
  validate({ params: V.classSectionParamSchema, query: V.progressQuery }),
  C.getProgress
);

router.post(
  '/progress',
  staffAccess,
  validate({ body: V.markProgressSchema }),
  C.markProgress
);

module.exports = router;
