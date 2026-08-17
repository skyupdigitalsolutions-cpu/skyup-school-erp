'use strict';
require('./models/StudentLeaveRequest');

// Student leave-of-absence requests — a SEPARATE model/module from the staff
// HR `leave-management` module (teacher/caretaker leave). Parent/student can
// create/list/cancel their own student's requests; staff (the student's
// class teacher, or principal/administrator unscoped) approve/reject.
module.exports = require('./routes');
