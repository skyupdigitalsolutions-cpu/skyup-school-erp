'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/AttendanceRepository');
const {
  getTeacherForUser,
  findMyClass,
  checkClassTeacherAccess,
  assertClassTeacherAccess,
} = require('../../../utils/teacherScope');

function normalizeDate(dateStr) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function computeSummary(records) {
  const counts = { present: 0, absent: 0, late: 0, excused: 0, holiday: 0 };
  records.forEach((r) => {
    if (Object.prototype.hasOwnProperty.call(counts, r.status)) counts[r.status] += 1;
  });
  return { ...counts, total: records.length };
}

/** Attendance %, holidays excluded from the denominator. Shared with the student-portal view. */
function percentageFromSummary(summary) {
  const denominator = summary.total - summary.holiday;
  return denominator > 0 ? Math.round((summary.present / denominator) * 1000) / 10 : null;
}

class AttendanceService {
  /** GET /attendance/class/mine — the class this teacher is class-teacher of. */
  async getMyClass(db, userId) {
    const teacher = await getTeacherForUser(db, userId);
    if (!teacher) return null;
    const klass = await findMyClass(db, teacher._id);
    if (!klass) return null;
    return {
      classId: klass._id,
      className: klass.name,
      section: (klass.sections || [])[0] || null,
      academicYear: klass.academicYear,
    };
  }

  /**
   * GET /attendance/class/:classId/:section — a teacher who isn't the class
   * teacher of this class simply sees an empty roster (read-path scoping).
   */
  async getRoster(db, user, { classId, section, date }) {
    const { allowed } = await checkClassTeacherAccess(db, user, classId);
    if (!allowed) {
      return { classId, className: null, section, academicYear: null, date, students: [], summary: computeSummary([]) };
    }

    const klass = await db.model('Class').findById(classId).lean();
    if (!klass) throw ApiError.notFound('Class not found.');

    const normalizedDate = normalizeDate(date);
    const [students, attendanceRows] = await Promise.all([
      repo.roster(db.model('Student'), { className: klass.name, section, academicYear: klass.academicYear }),
      repo.forClassSectionDate(db.model('Attendance'), { classId, section, date: normalizedDate }),
    ]);

    const byStudent = new Map(attendanceRows.map((r) => [String(r.student), r]));
    const studentsOut = students.map((s) => {
      const marked = byStudent.get(String(s._id));
      return {
        studentId: s._id,
        admissionNo: s.admissionNo,
        rollNo: s.rollNo,
        name: `${s.personal?.firstName || ''} ${s.personal?.lastName || ''}`.trim(),
        photo: s.photo || null,
        status: marked?.status || null,
        remarks: marked?.remarks || null,
      };
    });

    return {
      classId,
      className: klass.name,
      section,
      academicYear: klass.academicYear,
      date,
      students: studentsOut,
      summary: computeSummary(studentsOut.filter((s) => s.status)),
    };
  }

  /**
   * POST /attendance — bulk upsert. A teacher who isn't the class teacher of
   * `classId` is rejected outright (write-path scoping); every studentId must
   * belong to this class+section's roster or the whole request is rejected.
   */
  async markAttendance(db, user, { classId, section, date, period, records }) {
    await assertClassTeacherAccess(db, user, classId);

    const klass = await db.model('Class').findById(classId).lean();
    if (!klass) throw ApiError.notFound('Class not found.');

    const rosterStudents = await repo.roster(db.model('Student'), {
      className: klass.name,
      section,
      academicYear: klass.academicYear,
    });
    const rosterIds = new Set(rosterStudents.map((s) => String(s._id)));
    const invalid = records.filter((r) => !rosterIds.has(String(r.studentId)));
    if (invalid.length) {
      throw ApiError.badRequest(
        `These students are not on this class/section roster: ${invalid.map((r) => r.studentId).join(', ')}`
      );
    }

    const normalizedDate = normalizeDate(date);
    const model = db.model('Attendance');
    const saved = [];
    for (const r of records) {
      const doc = await repo.upsertOne(
        model,
        { classId, section, student: r.studentId, date: normalizedDate, period: period ?? null },
        { status: r.status, remarks: r.remarks, academicYear: klass.academicYear },
        user.id
      );
      saved.push(doc);
    }

    const summary = computeSummary(saved);
    await db
      .model('ActivityLog')
      .create({
        entityType: 'attendance',
        entityId: klass._id,
        action: 'marked',
        description:
          `Attendance marked for class ${klass.name}-${section} on ${date}: ` +
          `${summary.present} present, ${summary.absent} absent, ${summary.late} late, ` +
          `${summary.excused} excused, ${summary.holiday} holiday.`,
        meta: { classId, section, date, ...summary },
        performedBy: user.id,
      })
      .catch(() => {});

    return { date, summary, records: saved };
  }

  /** GET /attendance/student/:studentId/summary — present/absent counts + %. */
  async getStudentSummary(db, user, { studentId, from, to }) {
    const student = await db.model('Student').findById(studentId).lean();
    if (!student) throw ApiError.notFound('Student not found.');

    const klass = await db
      .model('Class')
      .findOne({ name: student.academic.class, academicYear: student.academic.academicYear })
      .lean();

    const { allowed } = await checkClassTeacherAccess(db, user, klass?._id);
    if (!allowed) {
      return { studentId, from, to, present: 0, absent: 0, late: 0, excused: 0, holiday: 0, total: 0, percentage: null };
    }

    const rows = await repo.forStudentRange(db.model('Attendance'), {
      studentId,
      from: normalizeDate(from),
      to: normalizeDate(to),
    });
    const summary = computeSummary(rows);
    const percentage = percentageFromSummary(summary);
    return { studentId, from, to, ...summary, percentage };
  }
}

module.exports = new AttendanceService();
// Shared with the student-portal attendance view (student-attendance module) —
// same math, reused rather than reimplemented.
module.exports.computeSummary = computeSummary;
module.exports.percentageFromSummary = percentageFromSummary;
module.exports.normalizeDate = normalizeDate;
