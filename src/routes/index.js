'use strict';

const express = require('express');
const ApiResponse = require('../core/ApiResponse');
const { registeredModelNames } = require('../database/modelRegistry');

const router = express.Router();

router.get('/health', (_req, res) =>
  ApiResponse.ok(res, { status: 'ok', uptime: process.uptime(), registeredModels: registeredModelNames(), timestamp: new Date().toISOString() }, 'Service healthy')
);

// ── Authentication (login / refresh / logout / me) ────────────────────────────
router.use('/auth', require('../modules/authentication').routes);

// ── Authorization (role → permission grants; administrator-only view/edit) ───
router.use('/authorization', require('../modules/authorization'));

// ── Student/Parent Authentication (same mechanism, separate credential store) ──
router.use('/student-auth', require('../modules/student-authentication'));

// ── Principal module (Student Management + Teacher Management) ────────────────
router.use('/principal', require('../modules/principal'));

// ── Dashboard (aggregated summary — no schema of its own) ─────────────────────
router.use('/dashboard', require('../modules/dashboard'));

// ── Caretaker Management ──────────────────────────────────────────────────────
router.use('/caretakers', require('../modules/caretaker'));

// ── Finance ────────────────────────────────────────────────────────────────────
router.use('/finance', require('../modules/finance'));

// ── Expenses (Maintenance/Infrastructure/Stationery/CCA — Finance writes, reversal-only correction) ──
router.use('/expenses', require('../modules/expenses'));

// ── Leave Management ───────────────────────────────────────────────────────────
router.use('/leave-management', require('../modules/leave-management'));

// ── Class Management ───────────────────────────────────────────────────────────
router.use('/classes', require('../modules/classes'));

// ── Event Management ──────────────────────────────────────────────────────────
router.use('/events', require('../modules/events'));

// ── Examination Management (legacy: exam logistics — directory/hall tickets) ──
router.use('/exams', require('../modules/exams'));

// ── Exam Scheduling & Marks Entry (new engine: Exam/ExamSchedule/ExamMark) ────
router.use('/exam-scheduling', require('../modules/exam-scheduling'));

// ── Notices & Quick Actions ────────────────────────────────────────────────────
router.use('/notices', require('../modules/notices'));

// ── Reports (aggregated breakdowns — no schema of its own) ────────────────────
router.use('/reports', require('../modules/reports'));

// ── Curriculum spine: Subjects + Syllabus tree ────────────────────────────────
router.use('/subjects', require('../modules/subjects'));

// ── Timetable ──────────────────────────────────────────────────────────────────
router.use('/timetable', require('../modules/timetable'));

// ── Syllabus tracker ───────────────────────────────────────────────────────────
router.use('/syllabus', require('../modules/syllabus'));

// ── Attendance register ────────────────────────────────────────────────────────
router.use('/attendance', require('../modules/attendance'));

// ── Teacher self-service profile ──────────────────────────────────────────────
router.use('/profile', require('../modules/profile'));

// ── Student/parent self-service profile (My Profile) ──────────────────────────
router.use('/student-profile', require('../modules/student-profile'));

// ── Student/parent attendance view (read-only, scoped to the logged-in student) ──
router.use('/student-attendance', require('../modules/student-attendance'));

// ── Student/parent timetable view (read-only, scoped to the student's own class) ──
router.use('/student-timetable', require('../modules/student-timetable'));

// ── Student/parent homework/diary view (read-only, scoped to the student) ────
router.use('/student-homework', require('../modules/student-homework'));

// ── Parent-only fees view (read-only, scoped to the student; child-safety gated) ──
router.use('/student-fees', require('../modules/student-fees'));

// ── Student/parent exam view (read-only; results gated on publish status) ────
router.use('/student-exams', require('../modules/student-exams'));

// ── Student/parent transport view (read-only, scoped to the student) ─────────
router.use('/student-transport', require('../modules/student-transport'));

// ── Student/parent events feed (read-only, public fields only) ───────────────
router.use('/student-events', require('../modules/student-events'));

// ── Student leave-of-absence requests (parent write; staff approve/reject) ───
router.use('/student-leave-requests', require('../modules/student-leave-requests'));

// ── Student/parent dashboard (aggregates the other student-scoped sources) ───
router.use('/student-dashboard', require('../modules/student-dashboard'));

// ── Caretaker (van) portal — bus trip logging, scoped to their own route(s) ──
router.use('/caretaker-transport', require('../modules/caretaker-transport'));

// ── Homework ───────────────────────────────────────────────────────────────────
router.use('/homework', require('../modules/homework'));

// ── Calendar (aggregated across modules + personal reminders) ────────────────
router.use('/calendar', require('../modules/calendar'));

// ── Lesson Planning (shares the SyllabusTopic curriculum spine) ──────────────
router.use('/lesson-plans', require('../modules/lesson-plans'));

// ── Study Material (shares the SyllabusTopic curriculum spine) ───────────────
router.use('/study-material', require('../modules/study-material'));

// ── Documents (teacher-owned personal docs + read-only school-issued docs) ──
router.use('/documents', require('../modules/documents'));

// ── Class Teacher (form-tutor view: full profile, behaviour log + class remarks) ──
router.use('/class-teacher', require('../modules/class-teacher'));

module.exports = router;