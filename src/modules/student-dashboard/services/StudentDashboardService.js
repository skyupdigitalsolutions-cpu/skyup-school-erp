'use strict';
const { canSeeFees } = require('../../../utils/studentScope');
const attendanceService = require('../../student-attendance/services/StudentAttendanceService');
const timetableService = require('../../student-timetable/services/StudentTimetableService');
const homeworkService = require('../../student-homework/services/StudentHomeworkService');
const examsService = require('../../student-exams/services/StudentExamsService');
const feesService = require('../../student-fees/services/StudentFeesService');
const transportService = require('../../student-transport/services/StudentTransportService');
const leaveService = require('../../student-leave-requests/services/StudentLeaveRequestService');
const eventsService = require('../../student-events/services/StudentEventsService');

function thisMonthRange() {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}

/**
 * Every card below is a THIN composition over an already-built, already-
 * tested student-scoped service — never a raw model query, and never a
 * fabricated number. A source with no real backing (Notifications — the
 * `notifications` module is an empty scaffold, no student-facing endpoint
 * exists) is reported as `{ available: false }` and nothing else; there is
 * no plausible-looking placeholder for it anywhere in this file.
 *
 * Per-source resilience: each card is wrapped so one throwing service
 * (a real bug, a bad DB state, whatever) degrades to `{ available: false,
 * error: true }` for THAT card only — the rest of the dashboard still
 * renders. This is deliberately NOT how the underlying pages behave (they
 * let an error bubble to their own error state) because the dashboard's job
 * is to stay useful even when one source is having a bad day.
 */
class StudentDashboardService {
  async _card(fn) {
    try {
      return await fn();
    } catch (err) {
      return { available: false, error: true };
    }
  }

  async _attendanceCard(db, user) {
    const { from, to } = thisMonthRange();
    const data = await attendanceService.getMyAttendance(db, user, { from, to });
    return { available: true, from, to, percentage: data.summary.percentage, present: data.summary.present, total: data.summary.total };
  }

  async _timetableCard(db, user) {
    const timetable = await timetableService.getMyTimetable(db, user);
    const todayDow = new Date().getDay();
    const today = timetable.days.find((d) => d.dayOfWeek === todayDow);
    return {
      available: true,
      className: timetable.className,
      section: timetable.section,
      periodCount: today?.periods?.length || 0,
      periods: (today?.periods || []).map((p) => ({ period: p.period, subject: p.subject || null })),
    };
  }

  async _homeworkCard(db, user) {
    const items = await homeworkService.listMine(db, user, {});
    const due = items.filter((h) => h.mySubmission.status === 'not_submitted');
    const overdue = due.filter((h) => h.isOverdue);
    const nextDue = due
      .slice()
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];
    return {
      available: true,
      dueCount: due.length,
      overdueCount: overdue.length,
      nextDue: nextDue ? { title: nextDue.title, subject: nextDue.subject?.name || null, dueDate: nextDue.dueDate } : null,
    };
  }

  async _examsCard(db, user) {
    const exams = await examsService.listMyExams(db, user);
    if (!exams.length) return { available: true, upcoming: null, latestResult: null };

    const now = Date.now();
    const upcoming = exams
      .filter((e) => e.startDate && new Date(e.startDate).getTime() >= now && e.status !== 'cancelled')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0] || null;

    // The service's own getResults() enforces the results_published gate —
    // calling it here reuses that gate exactly, never bypassing it.
    const publishedExam = exams
      .filter((e) => e.status === 'results_published')
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))[0] || null;
    let latestResult = null;
    if (publishedExam) {
      const results = await examsService.getResults(db, user, publishedExam._id);
      if (results.published) {
        latestResult = { examId: publishedExam._id, title: publishedExam.title, percentage: results.summary?.percentage ?? null };
      }
    }

    return {
      available: true,
      upcoming: upcoming ? { examId: upcoming._id, title: upcoming.title, startDate: upcoming.startDate } : null,
      latestResult,
    };
  }

  async _feesCard(db, user) {
    if (!canSeeFees(user.viewerType)) return { available: false, parentOnly: true };
    const data = await feesService.getMyFees(db, user);
    return { available: true, totalOutstanding: data.summary.totalOutstanding, status: data.summary.status, nextDueDate: data.summary.nextDueDate };
  }

  async _transportCard(db, user) {
    const data = await transportService.getMyTransport(db, user);
    if (!data.enrolled) return { available: true, enrolled: false };
    return { available: true, enrolled: true, routeNo: data.routeNo, stopName: data.stopName, vehicleNo: data.vehicleNo };
  }

  async _leaveCard(db, user) {
    const requests = await leaveService.listMine(db, user);
    const pending = requests.filter((r) => r.status === 'pending');
    const latest = requests[0] || null;
    return {
      available: true,
      pendingCount: pending.length,
      latest: latest ? { leaveType: latest.leaveType, status: latest.status, fromDate: latest.fromDate, toDate: latest.toDate } : null,
    };
  }

  async _eventsCard(db) {
    const events = await eventsService.listMyEvents(db);
    const next = events.find((e) => e.isUpcoming) || null;
    return {
      available: true,
      next: next ? { eventId: next._id, name: next.name, startDate: next.startDate, category: next.category } : null,
    };
  }

  /** GET /student-dashboard/me — one aggregation, per-source resilient, nothing invented. */
  async getDashboard(db, user) {
    const [attendance, timetable, homework, exams, fees, transport, leaveRequests, events] = await Promise.all([
      this._card(() => this._attendanceCard(db, user)),
      this._card(() => this._timetableCard(db, user)),
      this._card(() => this._homeworkCard(db, user)),
      this._card(() => this._examsCard(db, user)),
      this._card(() => this._feesCard(db, user)),
      this._card(() => this._transportCard(db, user)),
      this._card(() => this._leaveCard(db, user)),
      this._card(() => this._eventsCard(db)),
    ]);

    return {
      attendance,
      timetable,
      homework,
      exams,
      fees,
      transport,
      leaveRequests,
      events,
      // Notifications has no backing module (`modules/notifications/` is an
      // empty scaffold) — explicit, honest, never a synthesized count.
      notifications: { available: false },
    };
  }
}

module.exports = new StudentDashboardService();
