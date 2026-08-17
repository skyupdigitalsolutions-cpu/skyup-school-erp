'use strict';
// Student-homework has no schema of its own — it's a read-only,
// student-scoped view over the existing Homework/Submission models
// (homework module).
module.exports = require('./routes');
