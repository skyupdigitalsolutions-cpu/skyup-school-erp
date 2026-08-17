'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ExpenseController');
const V = require('../validations/expenseSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

// Finance may create + reverse expenses (the one write area of this whole
// feature) — principal/administrator retain full access too, matching every
// other finance-adjacent route in this build.
const financeOrAbove = requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR, ROLES.FINANCE);

router.get('/stats', financeOrAbove, C.stats);
router.get('/', financeOrAbove, C.list);
router.post('/', financeOrAbove, validate({ body: V.createSchema }), C.create);
router.get('/:id', financeOrAbove, validate({ params: V.idParamSchema }), C.getById);
router.post('/:id/reverse', financeOrAbove, validate({ params: V.idParamSchema, body: V.reverseSchema }), C.reverse);

// Deliberately no PUT, no DELETE — reversal is the only correction path.

module.exports = router;
