'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/ExamSchedulingController');
const V = require('../validations/examSchedulingSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const manageOnly = requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);
// Teachers may read exam metadata/schedules (scoped to what they teach in the
// service layer) and enter marks for their own sittings; principal/admin are
// unrestricted throughout.
const staffRead = requireRoles(ROLES.TEACHER, ROLES.PRINCIPAL, ROLES.ADMINISTRATOR);

// ── Exam CRUD (principal/admin create/schedule; staff can read) ────────────
router.get('/exams', staffRead, C.listExams);
router.post('/exams', manageOnly, validate({ body: V.createExamSchema }), C.createExam);
router.get('/exams/:id', staffRead, validate({ params: V.idParamSchema }), C.getExam);
router.patch('/exams/:id', manageOnly, validate({ params: V.idParamSchema, body: V.updateExamSchema }), C.updateExam);
router.patch('/exams/:id/status', manageOnly, validate({ params: V.idParamSchema, body: V.statusSchema }), C.changeExamStatus);
router.delete('/exams/:id', manageOnly, validate({ params: V.idParamSchema }), C.deleteExam);

// ── Exam schedule / timetable (principal/admin write; teacher-scoped read) ─
router.get('/exams/:id/schedule', staffRead, validate({ params: V.idParamSchema }), C.getSchedule);
router.post(
  '/exams/:id/schedule',
  manageOnly,
  validate({ params: V.idParamSchema, body: V.createScheduleSchema }),
  C.addScheduleRow
);
router.patch(
  '/schedule/:scheduleId',
  manageOnly,
  validate({ params: V.scheduleIdParamSchema, body: V.updateScheduleSchema }),
  C.updateScheduleRow
);
router.delete('/schedule/:scheduleId', manageOnly, validate({ params: V.scheduleIdParamSchema }), C.deleteScheduleRow);

// ── Marks entry (subject teacher, scoped; principal/admin unrestricted) ────
router.get('/schedule/:scheduleId/marks-sheet', staffRead, validate({ params: V.scheduleIdParamSchema }), C.getMarksSheet);
router.post(
  '/schedule/:scheduleId/marks',
  staffRead,
  validate({ params: V.scheduleIdParamSchema, body: V.marksEntrySchema }),
  C.enterMarks
);

module.exports = router;
