'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/LessonPlanController');
const V = require('../validations/lessonPlanSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);
const reviewerOnly = requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

router.get('/mine', teacherOnly, validate({ query: V.listQuery }), C.listMine);
router.post('/', teacherOnly, validate({ body: V.createSchema }), C.create);
router.get('/:id', teacherOnly, validate({ params: V.idParamSchema }), C.getOne);
router.patch('/:id', teacherOnly, validate({ params: V.idParamSchema, body: V.updateSchema }), C.update);
router.patch('/:id/review', reviewerOnly, validate({ params: V.idParamSchema, body: V.reviewSchema }), C.review);

module.exports = router;
