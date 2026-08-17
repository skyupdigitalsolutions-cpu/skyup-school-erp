'use strict';
// Student/parent dashboard — pure composition over the OTHER student-scoped
// services (attendance/timetable/homework/exams/fees/transport/leave/events).
// No model of its own, no raw queries here — see StudentDashboardService's
// own comment for the per-source resilience and "never fabricate" rules.
module.exports = require('./routes');
