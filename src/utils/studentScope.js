'use strict';

/**
 * Student-portal equivalent of `teacherScope.js`. A student/parent token
 * already carries `studentId`/`viewerType` (embedded at login — see
 * `student-authentication/services/studentAuth.service.js`), so scoping here
 * never needs a DB round-trip to figure out "whose data is this": every
 * future student-facing page merges `ownStudentFilter(req.user)` into its
 * query and gets exactly one student's data, or none at all.
 */

/** Resolve the Student document this viewer is scoped to, or null. */
async function getOwnStudent(db, user) {
  if (!user || !user.studentId) return null;
  return db.model('Student').findById(user.studentId).lean();
}

/**
 * A Mongo filter fragment pinning a query to this ONE student. An
 * unknown/missing viewer gets a filter that matches nothing — never `{}`,
 * which would leak every student — same discipline as teacherScope.js.
 */
function ownStudentFilter(user, field = '_id') {
  if (!user || !user.studentId) return { _id: null };
  return { [field]: user.studentId };
}

/**
 * Fees are a deliberate child-data safeguard: a parent sees them, the
 * student themself never does. Unknown viewerType defaults to false (fail
 * closed, not open).
 */
function canSeeFees(viewerType) {
  return viewerType === 'parent';
}

/**
 * Resolve the ONE contact to reach for a student — their own
 * `parent.primaryContact` (father/mother/guardian), read live from the real
 * `Student` document, never from any embedded snapshot elsewhere that could
 * go stale. Falls back to any other parent contact with a phone number if
 * the primary one has none. Returns null if no contact has a phone at all —
 * never a fabricated number. Shared by the caretaker portal (calling a
 * parent about a stop) and Finance's bulk WhatsApp reminders (messaging a
 * parent about a due fee) — one resolution rule, not two.
 */
function resolveParentContact(student) {
  if (!student?.parent) return null;
  const order = [student.parent.primaryContact, 'father', 'mother', 'guardian'].filter(Boolean);
  for (const key of order) {
    const c = student.parent[key];
    if (c?.phone) return { name: c.name || null, phone: c.phone, relation: key };
  }
  return null;
}

module.exports = { getOwnStudent, ownStudentFilter, canSeeFees, resolveParentContact };
