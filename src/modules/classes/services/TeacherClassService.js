'use strict';
const ApiError = require('../../../core/ApiError');
const attendanceRepo = require('../../attendance/repositories/AttendanceRepository');
const { getTeacherForUser, hasClassAccess } = require('../../../utils/teacherScope');

function computeAttendanceSummary(records) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0, holiday: 0 };
  records.forEach((r) => {
    if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] += 1;
  });
  const total = records.length;
  const denominator = total - counts.holiday;
  const percentage = denominator > 0 ? Math.round((counts.present / denominator) * 1000) / 10 : null;
  return { ...counts, total, percentage };
}

/**
 * Teacher-facing "My Classes" view — a subject teacher (and/or class teacher)
 * sees only the class+section combinations they actually teach. This is the
 * highest-stakes scoping surface this session: every method re-derives access
 * from the AUTHENTICATED user, and every roster/profile query is additionally
 * cross-checked against the actual class+section before returning anything.
 */
class TeacherClassService {
  _tryModel(db, name) {
    try { return db.model(name); }
    catch { return null; }
  }

  /** GET /classes/mine — every class+section this teacher teaches, with student counts. */
  async getMyClasses(db, userId) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return [];

    const TimetableEntry = this._tryModel(db, 'TimetableEntry');
    const Class = this._tryModel(db, 'Class');
    const Student = this._tryModel(db, 'Student');

    const entries = TimetableEntry
      ? await TimetableEntry.find({ staff: teacher._id })
          .populate([
            { path: 'subject', select: 'name code' },
            { path: 'class', select: 'name academicYear classTeacher' },
          ])
          .lean()
      : [];

    const combos = new Map();
    entries.forEach((e) => {
      if (!e.class) return;
      const key = `${e.class._id}_${e.section}`;
      if (!combos.has(key)) {
        combos.set(key, {
          classId: e.class._id,
          className: e.class.name,
          section: e.section,
          academicYear: e.class.academicYear,
          subjects: new Set(),
          isClassTeacher: !!e.class.classTeacher && String(e.class.classTeacher) === String(teacher._id),
        });
      }
      if (e.subject) combos.get(key).subjects.add(e.subject.name);
    });

    // Also surface class-teacher assignments that have no TimetableEntry yet.
    const ownedClasses = Class ? await Class.find({ classTeacher: teacher._id }).lean() : [];
    ownedClasses.forEach((klass) => {
      (klass.sections || []).forEach((section) => {
        const key = `${klass._id}_${section}`;
        if (!combos.has(key)) {
          combos.set(key, {
            classId: klass._id,
            className: klass.name,
            section,
            academicYear: klass.academicYear,
            subjects: new Set(),
            isClassTeacher: true,
          });
        }
      });
    });

    const list = [...combos.values()];
    return Promise.all(
      list.map(async (c) => {
        const studentCount = Student
          ? await Student.countDocuments({
              'academic.class': c.className,
              'academic.section': c.section,
              'academic.academicYear': c.academicYear,
              status: 'active',
            })
          : 0;
        return { ...c, subjects: [...c.subjects], studentCount };
      })
    );
  }

  /**
   * GET /classes/:classId/students — a teaching-view roster only (no fee,
   * address, guardian, or medical data). A teacher who doesn't teach this
   * class+section sees an empty roster, never another class's students.
   */
  async getRoster(db, user, { classId, section }) {
    const teacher = await getTeacherForUser(db, user.id);
    const allowed = await hasClassAccess(db, teacher?._id, classId, section);
    if (!allowed) return { classId, section, className: null, academicYear: null, students: [] };

    const klass = await db.model('Class').findById(classId).lean();
    if (!klass) return { classId, section, className: null, academicYear: null, students: [] };

    const students = await attendanceRepo.roster(db.model('Student'), {
      className: klass.name,
      section,
      academicYear: klass.academicYear,
    });

    return {
      classId,
      className: klass.name,
      section,
      academicYear: klass.academicYear,
      students: students.map((s) => ({
        studentId: s._id,
        admissionNo: s.admissionNo,
        rollNo: s.rollNo,
        name: `${s.personal?.firstName || ''} ${s.personal?.lastName || ''}`.trim(),
        photo: s.photo || null,
      })),
    };
  }

  /**
   * GET /classes/:classId/students/:studentId — teaching-focused profile:
   * identity + attendance in THIS class only. No marks (no Marks model
   * exists yet) and no master-record fields (fee, address, parent, medical).
   */
  async getStudentProfile(db, user, { classId, section, studentId }) {
    const teacher = await getTeacherForUser(db, user.id);
    const allowed = await hasClassAccess(db, teacher?._id, classId, section);
    if (!allowed) throw ApiError.forbidden('You do not teach this class.');

    const klass = await db.model('Class').findById(classId).lean();
    if (!klass) throw ApiError.notFound('Class not found.');

    const student = await db.model('Student').findById(studentId).lean();
    // Defense in depth: the student must actually belong to THIS class+section,
    // not just exist somewhere — otherwise a teacher could probe another
    // class's student by id while only ever teaching this one.
    if (!student || student.academic?.class !== klass.name || student.academic?.section !== section) {
      throw ApiError.notFound('Student not found in this class.');
    }

    const Attendance = this._tryModel(db, 'Attendance');
    let attendance = null;
    if (Attendance) {
      const records = await Attendance.find({ student: studentId, class: classId, section }).lean();
      if (records.length > 0) attendance = computeAttendanceSummary(records);
    }

    return {
      studentId: student._id,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo,
      name: `${student.personal?.firstName || ''} ${student.personal?.lastName || ''}`.trim(),
      photo: student.photo || null,
      attendance, // null when there's no Attendance model or no records yet
    };
  }

  /** GET /classes/:classId/stats — only stats backed by data that actually exists. */
  async getStats(db, user, { classId, section }) {
    const teacher = await getTeacherForUser(db, user.id);
    const allowed = await hasClassAccess(db, teacher?._id, classId, section);
    if (!allowed) return { classId, section, studentCount: 0 };

    const klass = await db.model('Class').findById(classId).lean();
    if (!klass) return { classId, section, studentCount: 0 };

    const students = await attendanceRepo.roster(db.model('Student'), {
      className: klass.name,
      section,
      academicYear: klass.academicYear,
    });

    const stats = { classId, section, studentCount: students.length };

    const Attendance = this._tryModel(db, 'Attendance');
    if (Attendance) {
      const records = await Attendance.find({ class: classId, section }).lean();
      if (records.length > 0) stats.attendance = computeAttendanceSummary(records);
    }

    return stats;
  }
}

module.exports = new TeacherClassService();
