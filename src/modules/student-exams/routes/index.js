'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentExamsController');
const V = require('../validations/studentExamsSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

// Read-only throughout — no write route on this module. Exams/timetable are
// fine for both viewer types (unlike Fees, not gated by viewerType); results
// are gated instead by the exam's own publish status (see the service).
router.get('/me', viewerOnly, C.listMyExams);
router.get('/:examId/timetable', viewerOnly, validate({ params: V.examIdParamSchema }), C.getTimetable);
router.get('/:examId/admit-card', viewerOnly, validate({ params: V.examIdParamSchema }), C.getAdmitCard);
router.get('/:examId/results', viewerOnly, validate({ params: V.examIdParamSchema }), C.getResults);

module.exports = router;
