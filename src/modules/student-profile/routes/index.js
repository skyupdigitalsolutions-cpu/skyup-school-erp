'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentProfileController');
const V = require('../validations/studentProfileSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);
const parentOnly = requireRoles(ROLES.PARENT);

router.get('/me', viewerOnly, C.getMe);

// parentOnly — a student viewer must never edit their own record, not even
// contact fields. stripUnknown: false — a forbidden field (e.g. class,
// rollNo, admissionNo, feeStatus) must be REJECTED, never silently ignored.
// See studentProfileSchemas.js.
router.patch('/me', parentOnly, validate({ body: V.updateMeSchema }, { stripUnknown: false }), C.updateMe);

module.exports = router;
