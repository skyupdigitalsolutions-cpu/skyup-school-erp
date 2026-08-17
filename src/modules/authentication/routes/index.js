'use strict';

const express = require('express');
const { authLimiter } = require('../../../middlewares/rateLimiter');
const tenantResolver = require('../../../middlewares/tenantResolver');
const authenticate = require('../../../middlewares/authenticate');
const { validate } = require('../../../middlewares/validate');
const controller = require('../controllers/auth.controller');
const { loginSchema } = require('../validations/auth.validation');

const router = express.Router();

// All auth routes are school-scoped: the school is resolved from X-Tenant-Id
// (or sub-domain) before anything else runs.

router.post(
  '/login',
  authLimiter,
  tenantResolver,
  validate(loginSchema),
  controller.login
);

router.post('/refresh', authLimiter, tenantResolver, controller.refresh);

router.post('/logout', tenantResolver, authenticate, controller.logout);

router.get('/me', tenantResolver, authenticate, controller.me);

module.exports = router;
