'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ClassController');
const TC = require('../controllers/TeacherClassController');
const TV = require('../validations/teacherClassSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);

// ── Teacher-facing "My Classes" — registered BEFORE the principal's /:id route
// so '/mine' is never swallowed as an :id. ──────────────────────────────────
router.get('/mine', teacherOnly, TC.getMine);
router.get(
  '/:classId/students',
  teacherOnly,
  validate({ params: TV.classIdParamSchema, query: TV.sectionQuery }),
  TC.getRoster
);
router.get(
  '/:classId/students/:studentId',
  teacherOnly,
  validate({ params: TV.classStudentParamSchema, query: TV.sectionQuery }),
  TC.getStudentProfile
);
router.get(
  '/:classId/stats',
  teacherOnly,
  validate({ params: TV.classIdParamSchema, query: TV.sectionQuery }),
  TC.getStats
);

// ── Principal/Administrator class management (existing, untouched) ──────────
router.get('/stats', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.stats);
router.get('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.list);
router.post('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.create);
router.get('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.getById);
router.put('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.update);
router.delete('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.remove);

module.exports = router;