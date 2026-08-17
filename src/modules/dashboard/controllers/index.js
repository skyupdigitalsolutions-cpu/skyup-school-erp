'use strict';
// Dashboard has no schema of its own — it aggregates data from models
// registered by other modules (Student, Teacher, Caretaker, Class, Event,
// Examination), so there is nothing to register here.
module.exports = require('./routes');