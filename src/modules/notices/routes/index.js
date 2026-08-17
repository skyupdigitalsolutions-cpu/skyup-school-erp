'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/NoticeController');

const router = express.Router();
router.use(tenantResolver, authenticate);

router.get('/stats', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.stats);
router.get('/latest', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.latest);
router.get('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.list);
router.post('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.create);
router.get('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.getById);
router.put('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.update);
router.delete('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.remove);

module.exports = router;