'use strict';
const ApiError = require('../../../core/ApiError');
const attendanceRepo = require('../../attendance/repositories/AttendanceRepository');
const { getTeacherForUser, findMyClass, isClassTeacherOf } = require('../../../utils/teacherScope');

function studentName(s) {
  return `${s.personal?.firstName || ''} ${s.personal?.lastName || ''}`.trim();
}

/**
 * The form-tutor view: everything about the ONE class this teacher is class
 * teacher of — a WIDER scope than the subject-teacher "My Classes" view
 * (TeacherClassService), which is why every read here is gated by
 * `isClassTeacherOf`/`findMyClass`, never the looser `hasClassAccess`.
 */
class ClassTeacherService {
  /** GET /class-teacher/my-class — the class this teacher is class teacher of, with its roster. */
  async getMyClass(db, userId) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return { isClassTeacher: false };

    const klass = await findMyClass(db, teacher._id);
    if (!klass) return { isClassTeacher: false };

    const section = (klass.sections || [])[0] || null;
    const students = section
      ? await attendanceRepo.roster(db.model('Student'), { className: klass.name, section, academicYear: klass.academicYear })
      : [];

    return {
      isClassTeacher: true,
      classId: klass._id,
      className: klass.name,
      section,
      academicYear: klass.academicYear,
      students: students.map((s) => ({
        studentId: s._id, admissionNo: s.admissionNo, rollNo: s.rollNo, name: studentName(s), photo: s.photo || null, status: s.status,
      })),
    };
  }

  /**
   * Resolve a student AND verify this teacher is the class teacher of the
   * class that student is actually enrolled in. A student outside that class
   * doesn't exist as far as this teacher is concerned — 404, not 403, so a
   * crafted studentId can't even confirm a real student sits behind it.
   */
  async _resolveOwnStudent(db, teacherId, studentId) {
    const student = await db.model('Student').findById(studentId).lean();
    if (!student) throw ApiError.notFound('Student not found.');

    const klass = await db
      .model('Class')
      .findOne({ name: student.academic.class, academicYear: student.academic.academicYear })
      .lean();
    const owns = klass && (await isClassTeacherOf(db, teacherId, klass._id));
    if (!owns) throw ApiError.notFound('Student not found.');

    return { student, klass };
  }

  /** GET /class-teacher/students/:studentId — the full, all-subject form-tutor profile. */
  async getStudentProfile(db, user, studentId) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.notFound('Student not found.');
    const { student, klass } = await this._resolveOwnStudent(db, teacher._id, studentId);

    const attendanceRows = await db
      .model('Attendance')
      .find({ student: student._id, class: klass._id, section: student.academic.section })
      .lean();
    const counts = { present: 0, absent: 0, late: 0, excused: 0, holiday: 0 };
    attendanceRows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status] += 1; });
    const total = attendanceRows.length;
    const denominator = total - counts.holiday;
    const percentage = denominator > 0 ? Math.round((counts.present / denominator) * 1000) / 10 : null;

    const behaviourNotes = await db.model('BehaviourNote').find({ student: student._id }).sort({ date: -1 }).lean();

    return {
      studentId: student._id,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      name: studentName(student),
      photo: student.photo || null,
      status: student.status,
      personal: student.personal,
      academic: student.academic,
      parent: student.parent,
      medical: student.medical,
      transport: student.transport,
      library: student.library,
      attendance: { ...counts, total, percentage },
      behaviourNotes,
      // Report cards need an exams module recording marks — none exists yet, so this is honest, not fabricated.
      examData: { available: false, message: 'No exam/marks data recorded yet for this student.' },
    };
  }

  /** GET /class-teacher/report-card/:studentId — real once exams exist; honestly empty until then. */
  async getReportCard(db, user, studentId) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.notFound('Student not found.');
    await this._resolveOwnStudent(db, teacher._id, studentId); // ownership check only — 404 if outside this teacher's class.

    return { available: false, message: 'Report cards will appear once exams are recorded.' };
  }

  /** GET /class-teacher/behaviour-notes?studentId= — the class teacher's own log; omit studentId for the full log (notes + class remarks). */
  async listBehaviourNotes(db, userId, { studentId }) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const klass = await findMyClass(db, teacher._id);
    if (!klass) return [];

    const filter = { class: klass._id };
    if (studentId) filter.student = studentId;

    return db
      .model('BehaviourNote')
      .find(filter)
      .sort({ date: -1 })
      .populate({ path: 'student', select: 'personal.firstName personal.lastName rollNo' })
      .lean();
  }

  /** POST /class-teacher/behaviour-notes — `studentId` omitted/null means a class-level remark. */
  async createBehaviourNote(db, user, { studentId, type, note, date }) {
    const teacher = await getTeacherForUser(db, user.id);
    if (!teacher) throw ApiError.forbidden('No teacher profile linked to this account.');

    const klass = await findMyClass(db, teacher._id);
    if (!klass) throw ApiError.forbidden('You are not the class teacher of any class.');

    let section = (klass.sections || [])[0] || null;
    if (studentId) {
      const student = await db.model('Student').findById(studentId).lean();
      if (!student || student.academic.class !== klass.name || student.academic.academicYear !== klass.academicYear) {
        throw ApiError.badRequest('Student not found in this class.');
      }
      section = student.academic.section;
    }

    const created = await db.model('BehaviourNote').create({
      class: klass._id,
      section,
      student: studentId || null,
      author: teacher._id,
      type,
      note,
      date: date || new Date(),
      createdBy: user.id,
      updatedBy: user.id,
    });

    await db
      .model('ActivityLog')
      .create({
        entityType: 'behaviour_note',
        entityId: created._id,
        action: 'created',
        description: studentId ? `Behaviour note (${type}) recorded for a student.` : `Class remark (${type}) recorded.`,
        meta: { classId: klass._id, studentId: studentId || null, type },
        performedBy: user.id,
      })
      .catch(() => {});

    return created;
  }
}

module.exports = new ClassTeacherService();
