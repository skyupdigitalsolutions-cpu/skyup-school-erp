'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentLeaveRequestController');
const V = require('../validations/studentLeaveRequestSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

// ── Parent/student side — the ONE write action on the parent portal ────────
const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

router.post('/', viewerOnly, validate({ body: V.createSchema }), C.create);
router.get('/me', viewerOnly, C.listMine);
router.post('/:id/cancel', viewerOnly, validate({ params: V.idParamSchema }), C.cancelMine);

// ── Staff side — the class teacher of the student's class, or unscoped for
// principal/administrator (see StudentLeaveRequestService._scopedStudentIds) ──
const staffOnly = requireRoles(ROLES.TEACHER, ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

router.get('/staff', staffOnly, C.listForStaff);
router.post('/staff/:id/approve', staffOnly, validate({ params: V.idParamSchema, body: V.decideSchema }), C.approve);
router.post('/staff/:id/reject', staffOnly, validate({ params: V.idParamSchema, body: V.decideSchema }), C.reject);

module.exports = router;
