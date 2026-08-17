'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/AuthorizationController');
const V = require('../validations/authorizationSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

// Administrator-only — viewing/editing what each role can do is itself a
// permission-sensitive action, gated by role (not permission) same as every
// other "who can configure the system" action in this codebase.
const adminOnly = requireRoles(ROLES.ADMINISTRATOR);

router.get('/roles', adminOnly, C.listRoles);
router.patch('/roles/:role', adminOnly, validate({ params: V.roleParamSchema, body: V.updateRoleSchema }), C.updateRole);

module.exports = router;
