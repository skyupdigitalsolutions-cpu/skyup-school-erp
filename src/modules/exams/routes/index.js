'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ExaminationController');

const router = express.Router();
router.use(tenantResolver, authenticate);

router.get('/dashboard', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.dashboardStats);
router.get('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.list);
router.post('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.create);
router.get('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.getById);
router.put('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.update);
router.patch('/:id/status', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.changeStatus);
router.post('/:id/marks', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.enterMarks);
router.post('/:id/publish-results', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.publishResults);
router.post('/:id/hall-tickets', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.generateHallTickets);
router.post('/:id/documents', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.addDocument);
router.delete('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.remove);

module.exports = router;
