'use strict';

const { resolveParentContact } = require('./studentScope');

/**
 * Scoping helper for the caretaker (van) portal — the exact same shape as
 * `teacherScope.js`'s `getTeacherForUser`: a DB lookup by `userId`, never
 * embedded in the token. There is no `TransportRoute` model in this
 * codebase (confirmed by reading every model) — "route" is a plain string
 * that already lives on `Caretaker.vehicleDetails.route` and on each entry
 * in `Caretaker.assignedStudents[].route`, populated by the principal via
 * the existing `assignStudents` endpoint. A caretaker's own route(s) are
 * simply the distinct route values appearing on their own document.
 */

/** Resolve the Caretaker document linked to a logged-in user, or null. */
async function getCaretakerForUser(db, userId) {
  if (!userId) return null;
  return db.model('Caretaker').findOne({ userId }).lean();
}

/** The distinct route string(s) this caretaker is responsible for. */
function myRoutes(caretaker) {
  if (!caretaker) return [];
  const routes = new Set();
  if (caretaker.vehicleDetails?.route) routes.add(caretaker.vehicleDetails.route);
  (caretaker.assignedStudents || []).forEach((s) => { if (s.route) routes.add(s.route); });
  return [...routes];
}

/** Whether `route` is genuinely one this caretaker is responsible for. */
function ownsRoute(caretaker, route) {
  return myRoutes(caretaker).includes(route);
}

/** The roster (from `assignedStudents`) for one of this caretaker's own routes. */
function rosterForRoute(caretaker, route) {
  return (caretaker?.assignedStudents || []).filter((s) => s.route === route);
}

/** Whether `studentId` is genuinely on this caretaker's own route roster. */
function ownsStudent(caretaker, studentId) {
  return (caretaker?.assignedStudents || []).some((s) => String(s.studentId) === String(studentId));
}

// `resolveParentContact` moved to `studentScope.js` (shared with Finance's
// bulk WhatsApp reminders) — re-exported here so every existing caller of
// `caretakerScope.js` keeps working unchanged. Its own doc comment there
// explains the fallback rule; the caretaker-specific note that used to live
// here (never trust the `assignedStudents[].parentPhone` snapshot) still
// applies identically since the resolution logic itself hasn't changed.

module.exports = { getCaretakerForUser, myRoutes, ownsRoute, rosterForRoute, ownsStudent, resolveParentContact };
