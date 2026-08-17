'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/LeaveController');

const router = express.Router();
router.use(tenantResolver, authenticate);

router.get('/stats', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.stats);
router.get('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.list);
router.post('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.create);
router.get('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.getById);
router.post('/:id/approve', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.approve);
router.post('/:id/reject', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.reject);
router.delete('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.remove);

module.exports = router;