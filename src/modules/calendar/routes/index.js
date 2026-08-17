'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/CalendarController');
const V = require('../validations/calendarSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);

router.get('/me', teacherOnly, validate({ query: V.rangeQuery }), C.getMine);
router.post('/reminders', teacherOnly, validate({ body: V.createReminderSchema }), C.createReminder);
router.patch(
  '/reminders/:id',
  teacherOnly,
  validate({ params: V.idParamSchema, body: V.updateReminderSchema }),
  C.updateReminder
);
router.delete('/reminders/:id', teacherOnly, validate({ params: V.idParamSchema }), C.deleteReminder);

module.exports = router;
