'use strict';
const ApiError = require('../../../core/ApiError');
const { getOwnStudent, canSeeFees } = require('../../../utils/studentScope');

/**
 * Self-service student/parent profile. Every method resolves the Student
 * document from the AUTHENTICATED viewer's own `studentId` (never a
 * client-supplied id) — there is structurally no way to target another
 * student's record. See `src/utils/studentScope.js`.
 */
class StudentProfileService {
  async _logActivity(db, studentId, action, description, actorId) {
    try {
      await db.model('ActivityLog').create({
        entityType: 'student',
        entityId: studentId,
        action,
        description,
        performedBy: actorId,
      });
    } catch (_) { /* non-critical */ }
  }

  /** Fees are a deliberate child-data safeguard — never present for a student viewer. */
  _shape(student, viewerType) {
    const shaped = { ...student };
    if (!canSeeFees(viewerType)) delete shaped.feeStatus;
    return shaped;
  }

  /** GET /student-profile/me */
  async getMe(db, user) {
    const student = await getOwnStudent(db, user);
    if (!student) return null;
    return this._shape(student, user.viewerType);
  }

  /**
   * PATCH /student-profile/me — only ever touches the fields the request
   * schema allow-lists (guardian phone/email, address, emergency contact);
   * everything else (class, section, rollNo, admissionNo, fees, marks, ids)
   * is rejected at the validation layer before this ever runs. The route
   * additionally restricts this whole action to a parent viewer — a student
   * viewer never reaches here.
   */
  async updateMe(db, user, payload) {
    const student = await getOwnStudent(db, user);
    if (!student) throw ApiError.notFound('No student profile linked to this account.');

    const update = {};
    if (payload.parent?.father?.phone !== undefined) update['parent.father.phone'] = payload.parent.father.phone;
    if (payload.parent?.father?.email !== undefined) update['parent.father.email'] = payload.parent.father.email;
    if (payload.parent?.mother?.phone !== undefined) update['parent.mother.phone'] = payload.parent.mother.phone;
    if (payload.parent?.mother?.email !== undefined) update['parent.mother.email'] = payload.parent.mother.email;
    if (payload.parent?.guardian?.phone !== undefined) update['parent.guardian.phone'] = payload.parent.guardian.phone;
    if (payload.parent?.guardian?.email !== undefined) update['parent.guardian.email'] = payload.parent.guardian.email;
    if (payload.personal?.address !== undefined) update['personal.address'] = payload.personal.address;
    if (payload.medical?.emergencyContact !== undefined) update['medical.emergencyContact'] = payload.medical.emergencyContact;

    if (!Object.keys(update).length) throw ApiError.badRequest('No editable fields provided.');

    const updated = await db
      .model('Student')
      .findByIdAndUpdate(student._id, { $set: update }, { new: true, runValidators: true })
      .lean();

    await this._logActivity(db, student._id, 'profile_updated', 'Parent updated contact details.', user.id);
    return this._shape(updated, user.viewerType);
  }
}

module.exports = new StudentProfileService();
