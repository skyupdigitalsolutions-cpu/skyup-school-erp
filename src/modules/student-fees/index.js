'use strict';
// Student-fees has no schema of its own — it's a read-only, parent-only,
// student-scoped view over the existing FeeTransaction model (finance module).
module.exports = require('./routes');
