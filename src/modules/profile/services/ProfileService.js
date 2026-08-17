'use strict';
const ApiError = require('../../../core/ApiError');
const { getTeacherForUser } = require('../../../utils/teacherScope');

/**
 * Self-service teacher profile. Every method resolves the Teacher document
 * from the AUTHENTICATED user's own id (never a client-supplied id) — there
 * is structurally no way to target another staff member's record.
 */
class ProfileService {
  _tryModel(db, name) {
    try { return db.model(name); }
    catch { return null; }
  }

  async _logActivity(db, teacherId, action, description, actorId) {
    try {
      await db.model('ActivityLog').create({
        entityType: 'teacher',
        entityId: teacherId,
        action,
        description,
        performedBy: actorId,
      });
    } catch (_) { /* non-critical */ }
  }

  /**
   * Real teaching assignments derived from TimetableEntry — Teacher's own
   * `assignedSubjects` array is free-text and often left empty (see the
   * timetable module's comment on why TimetableEntry is the authoritative,
   * id-based source of "who teaches what, where").
   */
  async _teachingAssignments(db, teacherId) {
    const TimetableEntry = this._tryModel(db, 'TimetableEntry');
    if (!TimetableEntry) return [];

    const entries = await TimetableEntry.find({ staff: teacherId })
      .populate([
        { path: 'subject', select: 'name code' },
        { path: 'class', select: 'name academicYear classTeacher' },
      ])
      .lean();

    const seen = new Map();
    entries.forEach((e) => {
      if (!e.class) return;
      const key = `${e.class._id}_${e.section}_${e.subject?._id}`;
      if (seen.has(key)) return;
      seen.set(key, {
        classId: e.class._id,
        className: e.class.name,
        section: e.section,
        academicYear: e.class.academicYear,
        subject: e.subject ? { id: e.subject._id, name: e.subject.name, code: e.subject.code } : null,
        isClassTeacher: !!e.class.classTeacher && String(e.class.classTeacher) === String(teacherId),
      });
    });
    return [...seen.values()];
  }

  /** GET /profile/me */
  async getMe(db, userId) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return null;
    const teachingAssignments = await this._teachingAssignments(db, teacher._id);
    return { ...teacher, teachingAssignments };
  }

  /**
   * PATCH /profile/me — only ever touches the fields the request schema
   * allow-lists (photo, personal.phone, personal.address,
   * personal.emergencyContact); everything else is rejected at the
   * validation layer before this ever runs.
   */
  async updateMe(db, userId, payload) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) throw ApiError.notFound('No teacher profile linked to this account.');

    const update = {};
    if (payload.photo !== undefined) update.photo = payload.photo;
    if (payload.personal?.phone !== undefined) update['personal.phone'] = payload.personal.phone;
    if (payload.personal?.address !== undefined) update['personal.address'] = payload.personal.address;
    if (payload.personal?.emergencyContact !== undefined) {
      update['personal.emergencyContact'] = payload.personal.emergencyContact;
    }

    const updated = await db
      .model('Teacher')
      .findByIdAndUpdate(teacher._id, { $set: update, updatedBy: userId }, { new: true, runValidators: true })
      .lean();

    await this._logActivity(db, teacher._id, 'profile_updated', 'Updated their own profile.', userId);
    const teachingAssignments = await this._teachingAssignments(db, teacher._id);
    return { ...updated, teachingAssignments };
  }

  /** POST /profile/change-password */
  async changePassword(db, userId, { currentPassword, newPassword }) {
    const User = db.model('User');
    const user = await User.findById(userId).select('+password');
    if (!user) throw ApiError.notFound('User not found.');

    const matches = await user.comparePassword(currentPassword);
    if (!matches) throw ApiError.unauthorized('Current password is incorrect.');

    user.password = newPassword;
    // Same invalidation the logout endpoint uses — forces re-login on every
    // device once the current (short-lived) access token expires.
    user.tokenVersion += 1;
    await user.save();

    return { message: 'Password changed.' };
  }
}

module.exports = new ProfileService();
