'use strict';
const BaseRepository = require('../../../core/BaseRepository');

const CATEGORIES = ['maintenance', 'infrastructure', 'stationery', 'cca'];

class ExpenseRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.category) q.category = filters.category;
    if (filters.academicYear) q.academicYear = filters.academicYear;
    if (filters.status) q.status = filters.status;
    return this.paginate(model, q, { ...pagination, sort: { date: -1, createdAt: -1 } });
  }

  /**
   * Sums `amount` across ALL rows (reversed originals + their negative
   * reversal rows both included) — this is what makes the total correct
   * without any special-casing: a fully reversed entry always nets to zero.
   */
  async stats(model, { academicYear } = {}) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const baseMatch = { isDeleted: false };
    if (academicYear) baseMatch.academicYear = academicYear;

    const [overall, byCategory, thisMonth] = await Promise.all([
      model.aggregate([{ $match: baseMatch }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
      model.aggregate([{ $match: baseMatch }, { $group: { _id: '$category', amount: { $sum: '$amount' } } }]),
      model.aggregate([
        { $match: { ...baseMatch, date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, amount: { $sum: '$amount' } } },
      ]),
    ]);

    const byCategoryMap = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    byCategory.forEach((r) => { byCategoryMap[r._id] = r.amount; });

    return {
      totalOverall: overall[0]?.amount || 0,
      totalThisMonth: thisMonth[0]?.amount || 0,
      byCategory: byCategoryMap,
    };
  }
}

module.exports = new ExpenseRepository();
