'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentAttendanceController');
const V = require('../validations/studentAttendanceSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

// Read-only — no marking endpoint here. Fine for both parent and student
// viewers to see (unlike fees, attendance is not gated by viewerType).
router.get('/me', viewerOnly, validate({ query: V.rangeQuery }), C.getMyAttendance);

module.exports = router;
