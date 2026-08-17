'use strict';

/**
 * Principal module bootstrap.
 *
 * Requiring this file triggers three side-effects (in order):
 *   1. All tenant-scoped schemas are registered in the model registry so
 *      the connection manager can bind them to every school's database.
 *   2. The module's Express router is exported for mounting in src/routes/index.js.
 *
 * Import once — at app startup — before any route is hit.
 */

// ── 1. Register models ────────────────────────────────────────────────────────
require('./models/Student');
require('./models/Teacher');
require('./models/ActivityLog');

// ── 2. Export router ──────────────────────────────────────────────────────────
const router = require('./routes');
module.exports = router;
