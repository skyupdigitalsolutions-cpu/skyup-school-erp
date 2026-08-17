'use strict';
require('./models/BusTrip');
require('./models/BusTripStudentLog');

// Caretaker (van) portal — bus trip logging, scoped to the caretaker's own
// route(s) via `Caretaker.assignedStudents`/`vehicleDetails.route` (no
// TransportRoute model exists in this codebase — see caretakerScope.js).
module.exports = require('./routes');
