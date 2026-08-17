'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/TimetableController');
const V = require('../validations/timetableSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const manageOnly = requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);
const staffRead = requireRoles(ROLES.TEACHER, ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

router.get('/me', staffRead, C.getMine);

router.get(
  '/class/:classId/:section',
  staffRead,
  validate({ params: V.classSectionParamSchema, query: V.classSectionQuery }),
  C.getForClassSection
);

router.post('/', manageOnly, validate({ body: V.entrySchema }), C.create);
router.post('/bulk', manageOnly, validate({ body: V.bulkEntrySchema }), C.bulkCreate);

module.exports = router;
