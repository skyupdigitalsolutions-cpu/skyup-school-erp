'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentDashboardController');

const router = express.Router();
router.use(tenantResolver, authenticate);

// Read-only, aggregates other student-scoped services — no direct model
// access here. Visible to both viewer types (the Fees card itself gates on
// viewerType internally, matching every other page's convention).
const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

router.get('/me', viewerOnly, C.getMine);

module.exports = router;
