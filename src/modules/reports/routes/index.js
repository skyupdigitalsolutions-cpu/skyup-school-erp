'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ReportController');
const V = require('../validations/reportSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

router.get('/overview', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.overview);
router.get('/teacher', requireRoles(ROLES.TEACHER), validate({ query: V.teacherReportQuery }), C.teacherReport);

module.exports = router;