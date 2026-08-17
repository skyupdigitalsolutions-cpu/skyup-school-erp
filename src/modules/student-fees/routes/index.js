'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentFeesController');

const router = express.Router();
router.use(tenantResolver, authenticate);

// PARENT-ONLY at the route — a student-viewer token (roles: ['student']) is
// rejected with 403 here, never reaching the controller. This is the child-
// data safeguard the whole student-auth shell was built around (canSeeFees);
// the service layer repeats the check as defense in depth.
const parentOnly = requireRoles(ROLES.PARENT);

// Read-only — no payment/collection endpoint here. That's a finance-side
// staff action (see the `finance` module); this is a view only.
router.get('/me', parentOnly, C.getMine);

module.exports = router;
