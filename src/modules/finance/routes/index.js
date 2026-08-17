'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/FinanceController');
const DC = require('../controllers/FinanceDashboardController');
const RC = require('../controllers/FeeReminderController');
const RV = require('../validations/feeReminderSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

// GET-only for Finance — ledger writes (POST/PUT/DELETE below) stay
// principal/administrator-only. Finance never collects a payment.
router.get('/stats', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), C.stats);
router.get('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), C.list);
router.post('/', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.create);

// ── Finance dashboard summary (read-only, composes FeeTransaction + Teacher.payroll + Expense) ──
// Registered BEFORE the generic /:id routes below — /:id would otherwise
// treat "dashboard" as an id and match first, since Express matches routes
// in registration order.
router.get('/dashboard/summary', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), DC.dashboardSummary);

// ── Fee reminders — manual-note logging (unchanged) + real WhatsApp bulk send ──
// Same registration-order reasoning — /reminders must come before /:id.
router.get('/reminders', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), RC.list);
router.post('/reminders', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), RC.create);
router.get('/reminders/due', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), validate({ query: RV.dueQuerySchema }), RC.due);
router.get('/reminders/whatsapp-status', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), RC.whatsappStatus);
router.post('/reminders/bulk-send', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE), validate({ body: RV.bulkSendSchema }), RC.bulkSend);

router.get('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.getById);
router.put('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.update);
router.delete('/:id', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.remove);

module.exports = router;
