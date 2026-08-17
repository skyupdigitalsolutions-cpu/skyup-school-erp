'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/SubjectController');
const V = require('../validations/subjectSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const manageOnly = requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

// ── Subjects — any authenticated staff can read ──────────────────────────────
router.get('/', validate({ query: V.listSubjectQuery }), C.list);
router.post('/', manageOnly, validate({ body: V.createSubjectSchema }), C.create);
router.get('/:id', validate({ params: V.idParamSchema }), C.getById);
router.patch('/:id', manageOnly, validate({ params: V.idParamSchema, body: V.updateSubjectSchema }), C.update);
router.patch('/:id/archive', manageOnly, validate({ params: V.idParamSchema }), C.archive);

// ── Syllabus tree ─────────────────────────────────────────────────────────────
router.get('/:id/topics', validate({ params: V.idParamSchema, query: V.topicTreeQuery }), C.getTopicTree);
router.post('/:id/topics', manageOnly, validate({ params: V.idParamSchema, body: V.createTopicSchema }), C.createTopic);
router.patch(
  '/:id/topics/:topicId',
  manageOnly,
  validate({ params: V.topicIdParamSchema, body: V.updateTopicSchema }),
  C.updateTopic
);
router.patch(
  '/:id/topics/:topicId/archive',
  manageOnly,
  validate({ params: V.topicIdParamSchema }),
  C.archiveTopic
);

module.exports = router;
