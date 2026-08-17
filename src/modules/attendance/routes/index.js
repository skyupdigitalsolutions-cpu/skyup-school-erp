'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/AttendanceController');
const V = require('../validations/attendanceSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const staffAccess = requireRoles(ROLES.TEACHER, ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

router.get('/class/mine', requireRoles(ROLES.TEACHER), C.getMyClass);

router.get(
  '/class/:classId/:section',
  staffAccess,
  validate({ params: V.classSectionParamSchema, query: V.rosterQuery }),
  C.getRoster
);

router.post('/', staffAccess, validate({ body: V.markAttendanceSchema }), C.mark);

router.get(
  '/student/:studentId/summary',
  staffAccess,
  validate({ params: V.studentIdParamSchema, query: V.summaryQuery }),
  C.getStudentSummary
);

module.exports = router;
