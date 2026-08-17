'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentHomeworkController');
const V = require('../validations/studentHomeworkSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

// Read-only — no write route on this module. Submission rows are only ever
// created by the teacher's grade endpoint; there is no student-submission
// write path in this codebase to reuse (see StudentHomeworkService.js).
router.get('/me', viewerOnly, validate({ query: V.listQuery }), C.listMine);

module.exports = router;
