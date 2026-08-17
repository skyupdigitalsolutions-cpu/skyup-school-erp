'use strict';
// Student-attendance has no schema of its own — it's a read-only,
// student-scoped view over the existing Attendance model (attendance module).
module.exports = require('./routes');
