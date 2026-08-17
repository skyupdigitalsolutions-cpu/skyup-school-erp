'use strict';

const ApiError = require('../core/ApiError');
const { ROLES } = require('./constants');

/**
 * Shared scoping helpers for the timetable/syllabus modules.
 *
 * There is no Enrollment or ClassSection model in this codebase — Teacher's
 * own `assignedSubjects` array is free-text (subject/class/section as plain
 * strings, not references) and isn't queryable by id. TimetableEntry is the
 * only authoritative, id-based record of "which staff member teaches which
 * class+section(+subject)", so it doubles as the scoping source of truth.
 */

/** Resolve the Teacher document linked to a logged-in user, or null. */
async function getTeacherForUser(db, userId) {
  if (!userId) return null;
  return db.model('Teacher').findOne({ userId }).lean();
}

/**
 * Whether `staffId` has at least one TimetableEntry for the given class+section
 * (optionally narrowed to one subject).
 */
async function teachesSection(db, staffId, { classId, section, subjectId } = {}) {
  if (!staffId || !classId || !section) return false;
  const filter = { staff: staffId, class: classId, section };
  if (subjectId) filter.subject = subjectId;
  return db.model('TimetableEntry').exists(filter).then(Boolean);
}

/**
 * Non-throwing scope check for READ paths: a teacher who doesn't teach the
 * class simply sees nothing (mirrors the "unscoped role -> filter matching
 * nothing, never {}" principle) instead of leaking existence via a 403/404.
 * Principal/Administrator are always allowed, with no teacher scoping.
 *
 * @returns {Promise<{allowed:boolean, teacher:object|null}>}
 */
async function checkClassAccess(db, user, { classId, section, subjectId } = {}) {
  if (user.roles.includes(ROLES.PRINCIPAL) || user.roles.includes(ROLES.ADMINISTRATOR)) {
    return { allowed: true, teacher: null };
  }
  const teacher = await getTeacherForUser(db, user.id);
  if (!teacher) return { allowed: false, teacher: null };
  const allowed = await teachesSection(db, teacher._id, { classId, section, subjectId });
  return { allowed, teacher };
}

/**
 * Throwing variant for WRITE paths, where silently no-op-ing would be
 * confusing: a teacher acting on a class they don't teach gets a clear 403.
 *
 * @returns {Promise<object|null>} the requesting teacher's Teacher doc, or
 *   null when the caller is a principal/administrator (no teacher scoping).
 */
async function assertClassAccess(db, user, { classId, section, subjectId } = {}) {
  const { allowed, teacher } = await checkClassAccess(db, user, { classId, section, subjectId });
  if (!allowed) {
    throw ApiError.forbidden(
      teacher ? 'You do not teach this class.' : 'No teacher profile linked to this account.'
    );
  }
  return teacher;
}

/**
 * Whether `teacherId` is THE class teacher (Class.classTeacher) of `classId`.
 * This is a narrower, distinct relationship from teachesSection() above — a
 * class teacher owns the daily attendance register for their class, whether
 * or not they have a TimetableEntry there for a specific subject.
 */
async function isClassTeacherOf(db, teacherId, classId) {
  if (!teacherId || !classId) return false;
  const klass = await db.model('Class').findById(classId).select('classTeacher').lean();
  return !!(klass && klass.classTeacher && String(klass.classTeacher) === String(teacherId));
}

/** Non-throwing class-teacher check for READ paths (see checkClassAccess). */
async function checkClassTeacherAccess(db, user, classId) {
  if (user.roles.includes(ROLES.PRINCIPAL) || user.roles.includes(ROLES.ADMINISTRATOR)) {
    return { allowed: true, teacher: null };
  }
  const teacher = await getTeacherForUser(db, user.id);
  if (!teacher) return { allowed: false, teacher: null };
  const allowed = await isClassTeacherOf(db, teacher._id, classId);
  return { allowed, teacher };
}

/** Throwing class-teacher check for WRITE paths (see assertClassAccess). */
async function assertClassTeacherAccess(db, user, classId) {
  const { allowed, teacher } = await checkClassTeacherAccess(db, user, classId);
  if (!allowed) {
    throw ApiError.forbidden(
      teacher ? 'You are not the class teacher of this class.' : 'No teacher profile linked to this account.'
    );
  }
  return teacher;
}

/** The single Class a teacher is the class-teacher of, or null. */
async function findMyClass(db, teacherId) {
  if (!teacherId) return null;
  return db.model('Class').findOne({ classTeacher: teacherId }).lean();
}

/** Every Class a teacher is the class-teacher of (a teacher usually owns one, but this doesn't assume it). */
async function findMyClasses(db, teacherId) {
  if (!teacherId) return [];
  return db.model('Class').find({ classTeacher: teacherId }).lean();
}

/**
 * Broad "does this teacher have any real relationship to this class+section"
 * check — teaches a subject there (TimetableEntry) OR is its class teacher.
 * Shared by My Classes and Homework: both need "any class I teach", not the
 * narrower single-subject or class-teacher-only checks above.
 */
async function hasClassAccess(db, teacherId, classId, section) {
  if (!teacherId) return false;
  const [teaches, isClassTeacher] = await Promise.all([
    teachesSection(db, teacherId, { classId, section }),
    isClassTeacherOf(db, teacherId, classId),
  ]);
  return teaches || isClassTeacher;
}

module.exports = {
  getTeacherForUser,
  teachesSection,
  checkClassAccess,
  assertClassAccess,
  isClassTeacherOf,
  checkClassTeacherAccess,
  assertClassTeacherAccess,
  findMyClass,
  findMyClasses,
  hasClassAccess,
};
