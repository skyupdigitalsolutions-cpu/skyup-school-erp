'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ClassTeacherController');
const V = require('../validations/classTeacherSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);

router.get('/my-class', teacherOnly, C.getMyClass);
router.get('/students/:studentId', teacherOnly, validate({ params: V.studentIdParam }), C.getStudentProfile);
router.get('/report-card/:studentId', teacherOnly, validate({ params: V.studentIdParam }), C.getReportCard);
router.get('/behaviour-notes', teacherOnly, validate({ query: V.behaviourListQuery }), C.listBehaviourNotes);
router.post('/behaviour-notes', teacherOnly, validate({ body: V.behaviourCreateSchema }), C.createBehaviourNote);

module.exports = router;
