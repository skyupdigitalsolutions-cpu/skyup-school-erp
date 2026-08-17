'use strict';
const express = require('express');
const { authLimiter } = require('../../../middlewares/rateLimiter');
const tenantResolver = require('../../../middlewares/tenantResolver');
const authenticate = require('../../../middlewares/authenticate');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const controller = require('../controllers/studentAuth.controller');
const { loginSchema } = require('../validations/studentAuth.validation');

const router = express.Router();

const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

router.post('/login', authLimiter, tenantResolver, validate(loginSchema), controller.login);
router.post('/refresh', authLimiter, tenantResolver, controller.refresh);
router.post('/logout', tenantResolver, authenticate, viewerOnly, controller.logout);
router.get('/me', tenantResolver, authenticate, viewerOnly, controller.me);

module.exports = router;
