'use strict';
const mongoose = require('mongoose');
const BaseRepository = require('../../../core/BaseRepository');

class FeeTransactionRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.academicYear) q.academicYear = filters.academicYear;
    if (filters.feeType) q.feeType = filters.feeType;
    if (filters.status) q.status = filters.status;
    if (filters.student) q.student = filters.student;
    return this.paginate(model, q, { ...pagination, populate: { path: 'student', select: 'admissionNo personal.firstName personal.lastName academic.class academic.section' } });
  }

  async stats(model, filters = {}) {
    const match = { isDeleted: false };
    if (filters.academicYear) match.academicYear = filters.academicYear;

    const [totals, byFeeType, byStatus] = await Promise.all([
      model.aggregate([
        { $match: match },
        { $group: { _id: null, totalAmount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      model.aggregate([
        { $match: match },
        { $group: { _id: '$feeType', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      model.aggregate([
        { $match: match },
        { $group: { _id: '$status', amount: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const collected = byStatus.find(s => s._id === 'paid')?.amount || 0;
    const pending = byStatus.find(s => s._id === 'pending')?.amount || 0;
    const overdue = byStatus.find(s => s._id === 'overdue')?.amount || 0;

    return {
      totalAmount: totals[0]?.totalAmount || 0,
      totalTransactions: totals[0]?.count || 0,
      collected,
      pending,
      overdue,
      byFeeType: byFeeType.map(r => ({ label: r._id, amount: r.amount, count: r.count })),
      byStatus: byStatus.map(r => ({ label: r._id, amount: r.amount, count: r.count })),
    };
  }

  /** Sum of 'paid' transactions whose paidDate falls within [from, to] — used by the finance dashboard's "this month" card. */
  async collectedInRange(model, { from, to, academicYear } = {}) {
    const match = { isDeleted: false, status: 'paid', paidDate: { $gte: from, $lte: to } };
    if (academicYear) match.academicYear = academicYear;
    const rows = await model.aggregate([
      { $match: match },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]);
    return rows[0]?.amount || 0;
  }

  /** Count of DISTINCT students with at least one 'overdue' transaction — a student, not a row, is a defaulter. */
  async defaultersCount(model, { academicYear } = {}) {
    const match = { isDeleted: false, status: 'overdue' };
    if (academicYear) match.academicYear = academicYear;
    const students = await model.distinct('student', match);
    return students.length;
  }

  /**
   * Sum of unpaid amounts (`pending`/`partial`/`overdue`) per student whose
   * `dueDate` falls within [from, to] — the single source both the
   * Reminders "due this month" list AND the bulk-send recompute (per one
   * student, at send time) read from. One aggregation, reused for both, so
   * the amount a parent gets messaged can never drift from what was shown
   * on screen a moment earlier.
   * @param {string|null} studentId — narrow to one student (the bulk-send recompute); omit for the full list.
   */
  async dueByStudentInRange(model, { from, to, studentId } = {}) {
    const match = { isDeleted: false, status: { $in: ['pending', 'partial', 'overdue'] }, dueDate: { $gte: from, $lte: to } };
    // $match in an aggregation pipeline does NOT get Mongoose's automatic
    // query-casting the way .find()/.findOne() do — a plain hex string here
    // would never equal the stored ObjectId, silently matching nothing.
    if (studentId) match.student = new mongoose.Types.ObjectId(studentId);

    return model.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$student',
          dueAmount: { $sum: '$amount' },
          feeTypes: { $addToSet: '$feeType' },
          dueDate: { $min: '$dueDate' },
        },
      },
      { $sort: { dueAmount: -1 } },
    ]);
  }
}

module.exports = new FeeTransactionRepository();