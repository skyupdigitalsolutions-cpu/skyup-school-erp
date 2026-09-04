'use strict';
const { getTeacherForUser, findMyClasses } = require('../../../utils/teacherScope');
const attendanceRepo = require('../../attendance/repositories/AttendanceRepository');

class DashboardService {
  _tryModel(db, name) {
    try { return db.model(name); }
    catch { return null; }
  }

  async summary(db) {
    const Student = this._tryModel(db, 'Student');
    const Teacher = this._tryModel(db, 'Teacher');
    const Caretaker = this._tryModel(db, 'Caretaker');
    const Class = this._tryModel(db, 'Class');
    const Event = this._tryModel(db, 'Event');
    const Examination = this._tryModel(db, 'Examination');
    const FeeTransaction = this._tryModel(db, 'FeeTransaction');
    const Attendance = this._tryModel(db, 'Attendance');

    const [
      totalStudents, activeStudents,
      totalTeachers, activeTeachers,
      totalCaretakers, activeCaretakers,
      totalClasses,
      upcomingEvents,
      ongoingExams,
    ] = await Promise.all([
      Student ? Student.countDocuments({ isDeleted: false }) : 0,
      Student ? Student.countDocuments({ isDeleted: false, status: 'active' }) : 0,
      Teacher ? Teacher.countDocuments({ isDeleted: false }) : 0,
      Teacher ? Teacher.countDocuments({ isDeleted: false, status: 'active' }) : 0,
      Caretaker ? Caretaker.countDocuments({ isDeleted: false }) : 0,
      Caretaker ? Caretaker.countDocuments({ isDeleted: false, status: 'active' }) : 0,
      Class ? Class.countDocuments({ isDeleted: false, status: 'active' }) : 0,
      Event ? Event.countDocuments({ isDeleted: false, 'schedule.startDate': { $gte: new Date() }, status: { $in: ['approved', 'pending_approval'] } }) : 0,
      Examination ? Examination.countDocuments({ isDeleted: false, status: { $in: ['scheduled', 'ongoing'] } }) : 0,
    ]);

    const recentEvents = Event
      ? await Event.find({ isDeleted: false }).sort({ 'schedule.startDate': 1 }).limit(5).select('name category schedule.startDate status').lean()
      : [];

    const recentExams = Examination
      ? await Examination.find({ isDeleted: false }).sort({ createdAt: -1 }).limit(5).select('name type academicYear status').lean()
      : [];

    const feeByStatus = FeeTransaction
      ? await FeeTransaction.aggregate([
          { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
        ])
      : [];
    const fees = { paid: 0, pending: 0, partial: 0, overdue: 0, refunded: 0 };
    for (const row of feeByStatus) {
      if (row._id in fees) fees[row._id] = row.total;
    }

    const attendanceTrend = Attendance ? await this._attendanceTrend(Attendance) : [];

    return {
      students: { total: totalStudents, active: activeStudents },
      teachers: { total: totalTeachers, active: activeTeachers },
      caretakers: { total: totalCaretakers, active: activeCaretakers },
      classes: { total: totalClasses },
      events: { upcoming: upcomingEvents, recent: recentEvents },
      exams: { ongoing: ongoingExams, recent: recentExams },
      fees,
      attendanceTrend,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Present/absent counts per day for the last 7 calendar days (for the dashboard trend chart). */
  async _attendanceTrend(Attendance) {
    const since = new Date();
    since.setDate(since.getDate() - 6);
    since.setHours(0, 0, 0, 0);

    const rows = await Attendance.aggregate([
      { $match: { date: { $gte: since } } },
      {
        $group: {
          _id: { day: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, status: '$status' },
          count: { $sum: 1 },
        },
      },
    ]);

    const byDay = new Map();
    for (const row of rows) {
      const day = row._id.day;
      if (!byDay.has(day)) byDay.set(day, { date: day, present: 0, absent: 0, late: 0 });
      const bucket = byDay.get(day);
      if (row._id.status === 'present') bucket.present += row.count;
      else if (row._id.status === 'absent') bucket.absent += row.count;
      else if (row._id.status === 'late') bucket.late += row.count;
    }
    return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * GET /dashboard/teacher — everything the teacher dashboard needs in one
   * call. Every section is scoped to THIS teacher; sections backed by a model
   * that doesn't exist yet in this codebase (Homework, Notification) are left
   * out entirely rather than faked. See `_tryModel` above for the same
   * defensive pattern the principal summary already uses.
   */
  async teacherSummary(db, userId) {
    const teacher = await getTeacherForUser(db, userId);
    const announcements = await this._announcements(db);

    if (!teacher) {
      return {
        hasTeacherProfile: false,
        teacher: null,
        overview: { classesTaught: 0, totalStudents: 0, attendanceMarkedToday: { marked: 0, total: 0 } },
        todaysClasses: [],
        pendingTasks: [],
        ...(announcements ? { announcements } : {}),
        generatedAt: new Date().toISOString(),
      };
    }

    const TimetableEntry = this._tryModel(db, 'TimetableEntry');
    const Class = this._tryModel(db, 'Class');
    const Student = this._tryModel(db, 'Student');
    const Attendance = this._tryModel(db, 'Attendance');

    const allEntries = TimetableEntry
      ? await TimetableEntry.find({ staff: teacher._id })
          .populate([
            { path: 'subject', select: 'name code' },
            { path: 'class', select: 'name academicYear' },
          ])
          .lean()
      : [];

    const todayDow = new Date().getDay();
    const todaysClasses = allEntries
      .filter((e) => e.dayOfWeek === todayDow && e.class)
      .sort((a, b) => a.period - b.period)
      .map((e) => ({
        timetableEntryId: e._id,
        period: e.period,
        room: e.room,
        subject: e.subject ? { id: e.subject._id, name: e.subject.name, code: e.subject.code } : null,
        class: { id: e.class._id, name: e.class.name },
        section: e.section,
      }));

    // Distinct class+section combinations this teacher teaches (any subject).
    const comboMap = new Map();
    allEntries.forEach((e) => {
      if (!e.class) return;
      const key = `${e.class._id}_${e.section}`;
      if (!comboMap.has(key)) {
        comboMap.set(key, { className: e.class.name, academicYear: e.class.academicYear, section: e.section });
      }
    });
    const combos = [...comboMap.values()];

    let totalStudents = 0;
    if (Student && combos.length) {
      const counts = await Promise.all(
        combos.map((c) =>
          Student.countDocuments({
            'academic.class': c.className,
            'academic.section': c.section,
            'academic.academicYear': c.academicYear,
            status: 'active',
          })
        )
      );
      totalStudents = counts.reduce((sum, n) => sum + n, 0);
    }

    // Attendance is the class TEACHER's responsibility, not every subject
    // teacher's — scope pendingTasks/attendanceMarkedToday to owned classes.
    const pendingTasks = [];
    let markedTotal = 0;
    let rosterTotal = 0;

    if (Class && Student && Attendance) {
      const ownedClasses = await findMyClasses(db, teacher._id);
      const todayStr = new Date().toISOString().slice(0, 10);
      const todayDate = new Date(`${todayStr}T00:00:00.000Z`);

      for (const klass of ownedClasses) {
        for (const section of klass.sections || []) {
          const roster = await attendanceRepo.roster(Student, {
            className: klass.name,
            section,
            academicYear: klass.academicYear,
          });
          if (roster.length === 0) continue;

          const markedCount = await Attendance.countDocuments({ class: klass._id, section, date: todayDate });
          rosterTotal += roster.length;
          markedTotal += Math.min(markedCount, roster.length);

          if (markedCount < roster.length) {
            pendingTasks.push({
              type: 'attendance',
              classId: klass._id,
              className: klass.name,
              section,
              label: `Attendance not marked for ${klass.name}-${section}`,
              count: roster.length - markedCount,
              link: '/teacher/class-teacher/attendance',
            });
          }
        }
      }
    }

    return {
      hasTeacherProfile: true,
      teacher: {
        id: teacher._id,
        name: `${teacher.personal?.firstName || ''} ${teacher.personal?.lastName || ''}`.trim(),
        employeeId: teacher.employeeId,
      },
      overview: {
        classesTaught: combos.length,
        totalStudents,
        attendanceMarkedToday: { marked: markedTotal, total: rosterTotal },
      },
      todaysClasses,
      pendingTasks,
      ...(announcements ? { announcements } : {}),
      generatedAt: new Date().toISOString(),
    };
  }

  /** Latest teacher-visible notices, or undefined if the Notice model doesn't exist. */
  async _announcements(db) {
    const Notice = this._tryModel(db, 'Notice');
    if (!Notice) return undefined;
    const now = new Date();
    return Notice.find({
      status: 'published',
      audience: { $in: ['all', 'teachers'] },
      $or: [{ expiryDate: null }, { expiryDate: { $gte: now } }],
    })
      .sort({ pinned: -1, publishedDate: -1 })
      .limit(5)
      .select('title message category priority pinned publishedDate')
      .lean();
  }
}

module.exports = new DashboardService();
