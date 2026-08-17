'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/FeeTransactionRepository');

class FinanceService {
  _m(db) { return db.model('FeeTransaction'); }

  // Same defensive lookup pattern as DashboardService._tryModel — a model
  // this service reads for the summary (Teacher, Expense) but doesn't own.
  _tryModel(db, name) {
    try { return db.model(name); }
    catch { return null; }
  }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async stats(db, filters) { return repo.stats(this._m(db), filters); }

  /**
   * GET /finance/dashboard/summary — every figure here traces to a real
   * collection: FeeTransaction (via repo.stats + the two small aggregations
   * added alongside it — never Student.feeStatus, which is a separate,
   * independently-edited snapshot that can disagree with the ledger) and
   * Teacher.payroll for payroll, Expense for the expense cards. Nothing is
   * computed from more than one "current truth" per figure.
   */
  async summary(db, { academicYear } = {}) {
    const feeStats = await repo.stats(this._m(db), { academicYear });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const [thisMonthCollection, defaultersCount] = await Promise.all([
      repo.collectedInRange(this._m(db), { from: monthStart, to: monthEnd, academicYear }),
      repo.defaultersCount(this._m(db), { academicYear }),
    ]);

    const Teacher = this._tryModel(db, 'Teacher');
    const payrollTotal = Teacher
      ? (await Teacher.aggregate([
          { $match: { isDeleted: false, status: 'active' } },
          { $group: { _id: null, total: { $sum: '$payroll.grossSalary' } } },
        ]))[0]?.total || 0
      : 0;

    const Expense = this._tryModel(db, 'Expense');
    let expensesThisMonth = 0;
    let expensesByCategory = { maintenance: 0, infrastructure: 0, stationery: 0, cca: 0 };
    if (Expense) {
      const expenseRepo = require('../../expenses/repositories/ExpenseRepository');
      const expenseStats = await expenseRepo.stats(Expense, { academicYear });
      expensesThisMonth = expenseStats.totalThisMonth;
      expensesByCategory = expenseStats.byCategory;
    }

    // stats() only names collected/pending/overdue explicitly (kept as-is —
    // other consumers, e.g. the principal ledger page, already depend on
    // that exact shape); 'partial' amounts live in byStatus alongside them.
    const partial = feeStats.byStatus.find((s) => s.label === 'partial')?.amount || 0;

    return {
      academicYear: academicYear || null,
      totalCollected: feeStats.collected,
      totalOutstanding: feeStats.pending + feeStats.overdue + partial,
      thisMonthCollection,
      defaultersCount,
      payrollTotal,
      expensesThisMonth,
      expensesByCategory,
      generatedAt: new Date().toISOString(),
    };
  }

  async create(db, payload, actorId) {
    if (payload.status === 'paid' && !payload.paidDate) payload.paidDate = new Date();
    return repo.create(this._m(db), payload, actorId);
  }

  async getById(db, id) {
    const t = await repo.findById(this._m(db), id, { populate: { path: 'student', select: 'admissionNo personal.firstName personal.lastName academic.class academic.section' } });
    if (!t) throw ApiError.notFound('Fee transaction not found.');
    return t;
  }

  async update(db, id, payload, actorId) {
    await this.getById(db, id);
    if (payload.status === 'paid' && !payload.paidDate) payload.paidDate = new Date();
    return repo.updateById(this._m(db), id, payload, actorId);
  }

  async delete(db, id, actorId) {
    await this.getById(db, id);
    await repo.softDeleteById(this._m(db), id, actorId);
    return { message: 'Fee transaction deleted.' };
  }
}

module.exports = new FinanceService();