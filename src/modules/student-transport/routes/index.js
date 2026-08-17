'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentTransportController');

const router = express.Router();
router.use(tenantResolver, authenticate);

// Read-only throughout — no transport-management routes here. Visible to
// both viewer types (unlike Fees, transport isn't a child-data safeguard).
const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

router.get('/me', viewerOnly, C.getMine);
router.get('/live-trip', viewerOnly, C.getLiveTrip);

module.exports = router;
