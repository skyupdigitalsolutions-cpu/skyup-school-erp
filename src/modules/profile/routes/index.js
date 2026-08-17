'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ProfileController');
const V = require('../validations/profileSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);

router.get('/me', teacherOnly, C.getMe);

// stripUnknown: false — a forbidden field (e.g. professional.designation)
// must be REJECTED, never silently ignored. See profileSchemas.js.
router.patch('/me', teacherOnly, validate({ body: V.updateMeSchema }, { stripUnknown: false }), C.updateMe);

router.post('/change-password', teacherOnly, validate({ body: V.changePasswordSchema }), C.changePassword);

module.exports = router;
