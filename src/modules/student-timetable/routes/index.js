'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentTimetableController');

const router = express.Router();
router.use(tenantResolver, authenticate);

const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

// Read-only — no write route on this module. Fine for both viewer types
// (unlike fees, the timetable is not gated by viewerType).
router.get('/me', viewerOnly, C.getMine);

module.exports = router;
