'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudentEventsController');
const V = require('../validations/studentEventsSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

// Read-only, public-face-of-the-event feed — no management here (that's the
// staff `events` module). Visible to both viewer types identically; there is
// no per-student scoping since the Event model has no audience-targeting
// field (see StudentEventsService's comment).
const viewerOnly = requireRoles(ROLES.STUDENT, ROLES.PARENT);

router.get('/me', viewerOnly, C.listMine);
router.get('/:id', viewerOnly, validate({ params: V.idParamSchema }), C.getOne);

module.exports = router;
