'use strict';

const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles, requirePermissions } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');

const SC = require('../controllers/StudentController');
const TC = require('../controllers/TeacherController');
const V = require('../validations/principalSchemas');

const router = express.Router();

// All principal routes require a resolved tenant and an authenticated user.
router.use(tenantResolver, authenticate);

// ── Student Management ────────────────────────────────────────────────────────
const studentRouter = express.Router();

studentRouter.get(
  '/stats',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  SC.stats
);

studentRouter.get(
  '/',
  requirePermissions('student:read'),
  validate({ query: V.listStudentQuery }),
  SC.list
);

studentRouter.post(
  '/',
  requirePermissions('student:create'),
  validate({ body: V.createStudentSchema }),
  SC.create
);

studentRouter.post(
  '/bulk/promote',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.bulkPromoteSchema }),
  SC.bulkPromote
);

studentRouter.post(
  '/bulk/status',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.bulkStudentStatusSchema }),
  SC.bulkStatus
);

studentRouter.get(
  '/:id',
  requirePermissions('student:read'),
  SC.getById
);

studentRouter.put(
  '/:id',
  requirePermissions('student:update'),
  validate({ body: V.updateStudentSchema }),
  SC.update
);

studentRouter.patch(
  '/:id/status',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.changeStatusSchema }),
  SC.changeStatus
);

studentRouter.patch(
  '/:id/archive',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  SC.archive
);

studentRouter.delete(
  '/:id',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  SC.remove
);

studentRouter.post(
  '/:id/behaviour-notes',
  requirePermissions('student:update'),
  validate({ body: V.behaviourNoteSchema }),
  SC.addBehaviourNote
);

studentRouter.post(
  '/:id/awards',
  requirePermissions('student:update'),
  validate({ body: V.awardSchema }),
  SC.addAward
);

studentRouter.post(
  '/:id/documents',
  requirePermissions('student:update'),
  validate({ body: V.documentSchema }),
  SC.addDocument
);

studentRouter.delete(
  '/:id/documents/:docId',
  requirePermissions('student:update'),
  SC.removeDocument
);

studentRouter.get(
  '/:id/timeline',
  requirePermissions('student:read'),
  SC.getTimeline
);

// ── Teacher Management ────────────────────────────────────────────────────────
const teacherRouter = express.Router();

teacherRouter.get(
  '/dashboard',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  TC.dashboardStats
);

teacherRouter.get(
  '/',
  requirePermissions('teacher:read'),
  validate({ query: V.listTeacherQuery }),
  TC.list
);

teacherRouter.post(
  '/',
  requirePermissions('teacher:create'),
  validate({ body: V.createTeacherSchema }),
  TC.create
);

teacherRouter.post(
  '/bulk/status',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.bulkTeacherStatusSchema }),
  TC.bulkStatus
);

teacherRouter.get(
  '/:id',
  requirePermissions('teacher:read'),
  TC.getById
);

teacherRouter.put(
  '/:id',
  requirePermissions('teacher:update'),
  validate({ body: V.updateTeacherSchema }),
  TC.update
);

teacherRouter.patch(
  '/:id/status',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.changeTeacherStatusSchema }),
  TC.changeStatus
);

teacherRouter.patch(
  '/:id/archive',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  TC.archive
);

teacherRouter.delete(
  '/:id',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  TC.remove
);

teacherRouter.put(
  '/:id/subjects',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.assignSubjectsSchema }),
  TC.assignSubjects
);

teacherRouter.post(
  '/:id/performance-reviews',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.performanceReviewSchema }),
  TC.addPerformanceReview
);

teacherRouter.post(
  '/:id/documents',
  requirePermissions('teacher:update'),
  validate({ body: V.teacherDocumentSchema }),
  TC.addDocument
);

teacherRouter.delete(
  '/:id/documents/:docId',
  requirePermissions('teacher:update'),
  TC.removeDocument
);

teacherRouter.post(
  '/:id/assets',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.assignAssetSchema }),
  TC.assignAsset
);

teacherRouter.put(
  '/:id/ai-insights',
  requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR),
  validate({ body: V.aiInsightsSchema }),
  TC.updateAiInsights
);

teacherRouter.get(
  '/:id/timeline',
  requirePermissions('teacher:read'),
  TC.getTimeline
);

// Mount sub-routers
router.use('/students', studentRouter);
router.use('/teachers', teacherRouter);

module.exports = router;
