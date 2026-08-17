'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/HomeworkController');
const V = require('../validations/homeworkSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);

router.get('/mine', teacherOnly, validate({ query: V.listQuery }), C.listMine);
router.post('/', teacherOnly, validate({ body: V.createSchema }), C.create);
router.get('/:id', teacherOnly, validate({ params: V.idParamSchema }), C.getOne);
router.patch('/:id', teacherOnly, validate({ params: V.idParamSchema, body: V.updateSchema }), C.update);
router.get('/:id/submissions', teacherOnly, validate({ params: V.idParamSchema }), C.getSubmissions);
router.post(
  '/:id/submissions/:studentId/grade',
  teacherOnly,
  validate({ params: V.studentGradeParamSchema, body: V.gradeSchema }),
  C.gradeSubmission
);
router.get('/:id/analytics', teacherOnly, validate({ params: V.idParamSchema }), C.getAnalytics);

module.exports = router;
