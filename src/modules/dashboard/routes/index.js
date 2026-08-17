'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/DashboardController');

const router = express.Router();
router.use(tenantResolver, authenticate);

router.get('/summary', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.summary);
router.get('/teacher', requireRoles(ROLES.TEACHER), C.teacherSummary);

module.exports = router;