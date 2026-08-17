'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/CaretakerController');

const router = express.Router();
router.use(tenantResolver, authenticate);

router.get('/stats', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.stats);
router.get('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.list);
router.post('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.create);
router.post('/bulk/status', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.bulkStatus);
router.get('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.getById);
router.put('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.update);
router.patch('/:id/status', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.changeStatus);
router.patch('/:id/verify', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.verify);
router.put('/:id/students', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.assignStudents);
router.post('/:id/documents', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.addDocument);
router.delete('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.remove);

module.exports = router;
