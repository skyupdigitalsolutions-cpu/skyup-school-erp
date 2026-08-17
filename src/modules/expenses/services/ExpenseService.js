'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/ExpenseRepository');

class ExpenseService {
  _m(db) { return db.model('Expense'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }
  async stats(db, filters) { return repo.stats(this._m(db), filters); }

  async create(db, payload, actorId) {
    return repo.create(this._m(db), { ...payload, status: 'recorded', reversalOf: null }, actorId);
  }

  async getById(db, id) {
    const e = await repo.findById(this._m(db), id);
    if (!e) throw ApiError.notFound('Expense not found.');
    return e;
  }

  /**
   * The ONLY correction path. Never mutates the original's amount/category/
   * date — creates a new negative-amount row (`reversalOf` → original) and
   * flips the original's own `status` to 'reversed'. A row already reversed
   * cannot be reversed again.
   */
  async reverse(db, id, actorId, remarks) {
    const original = await this.getById(db, id);
    if (original.status === 'reversed') throw ApiError.conflict('This expense has already been reversed.');

    const reversal = await repo.create(this._m(db), {
      category: original.category,
      subCategory: original.subCategory,
      amount: -original.amount,
      academicYear: original.academicYear,
      date: new Date(),
      vendor: original.vendor,
      paymentMode: original.paymentMode,
      remarks: remarks || `Reversal of expense ${original._id}.`,
      status: 'recorded',
      reversalOf: original._id,
    }, actorId);

    original.status = 'reversed';
    original.updatedBy = actorId;
    await original.save();

    return { original, reversal };
  }
}

module.exports = new ExpenseService();
