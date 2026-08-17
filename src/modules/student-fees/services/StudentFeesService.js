'use strict';
const ApiError = require('../../../core/ApiError');
const { getOwnStudent, canSeeFees } = require('../../../utils/studentScope');

/**
 * Parent-only, read-only view of the existing fee ledger. This codebase's
 * ledger is a single flat `FeeTransaction` collection — one row per bill/
 * payment/refund, each carrying its own STORED `status`
 * (paid|pending|partial|overdue|refunded), amount in plain rupees (not
 * paise — see AddFeeTransaction.jsx's "Amount (₹)" field and
 * FinanceDirectory.jsx's `₹{amount.toLocaleString('en-IN')}`, neither divides
 * by 100). There are no separate Invoice/Payment/Adjustment models and no
 * per-row `deriveStatus` helper to reuse — each transaction's own status is
 * already authoritative, set by finance staff via FinanceService.
 *
 * What genuinely doesn't exist yet is a per-STUDENT aggregate summary — the
 * closest thing, `Student.feeStatus`, is an independently-edited snapshot
 * used only for the principal's directory filter (see its own model comment:
 * "snapshot; full ledger lives in fee-management module"), so it is NOT used
 * here. Instead this mirrors `FeeTransactionRepository.stats()`'s exact
 * aggregation style (sum amounts, group by status) narrowed to one student,
 * rather than inventing new fee math.
 */
class StudentFeesService {
  /** GET /student-fees/me — parent viewer only; the route already enforces this, this is defense in depth. */
  async getMyFees(db, user) {
    if (!canSeeFees(user.viewerType)) {
      throw ApiError.forbidden('Fees are only visible to the parent viewer.');
    }

    const student = await getOwnStudent(db, user);
    if (!student) {
      return { summary: this._emptySummary(), invoices: [], receipts: [] };
    }

    const transactions = await db
      .model('FeeTransaction')
      .find({ student: student._id })
      .sort({ dueDate: 1, createdAt: 1 })
      .lean();

    return {
      summary: this._summarize(transactions),
      invoices: transactions.map((t) => this._toInvoice(t)),
      receipts: transactions.filter((t) => t.status === 'paid').map((t) => this._toReceipt(t)),
    };
  }

  _emptySummary() {
    return { totalBilled: 0, totalPaid: 0, totalOutstanding: 0, status: null, nextDueDate: null };
  }

  /**
   * A row marked 'refunded' reversed its own billing, so it's excluded from
   * "billed" — everything else counts. A 'partial' row has no paid-portion
   * field in this model (only one `amount` + one `status` per row), so its
   * FULL amount sits in `totalOutstanding` — the row-level status badge
   * (shown per invoice) is what actually communicates the nuance to a parent.
   * This guarantees totalPaid + totalOutstanding === totalBilled exactly,
   * with no fabricated split.
   */
  _summarize(transactions) {
    const billable = transactions.filter((t) => t.status !== 'refunded');
    const totalBilled = billable.reduce((sum, t) => sum + t.amount, 0);
    const totalPaid = billable.filter((t) => t.status === 'paid').reduce((sum, t) => sum + t.amount, 0);
    const totalOutstanding = totalBilled - totalPaid;

    let status = null;
    if (totalBilled > 0) {
      if (totalOutstanding === 0) status = 'paid';
      else if (billable.some((t) => t.status === 'overdue')) status = 'overdue';
      else status = 'partial';
    }

    const unpaidDueDates = billable
      .filter((t) => ['pending', 'partial', 'overdue'].includes(t.status) && t.dueDate)
      .map((t) => t.dueDate)
      .sort((a, b) => new Date(a) - new Date(b));

    return { totalBilled, totalPaid, totalOutstanding, status, nextDueDate: unpaidDueDates[0] || null };
  }

  _toInvoice(t) {
    return {
      _id: t._id,
      feeType: t.feeType,
      amount: t.amount,
      status: t.status,
      dueDate: t.dueDate,
      paidDate: t.paidDate,
      paymentMode: t.paymentMode,
      transactionRef: t.transactionRef,
      remarks: t.remarks,
      academicYear: t.academicYear,
    };
  }

  _toReceipt(t) {
    return {
      _id: t._id,
      receiptNo: t.transactionRef || `RCPT-${String(t._id).slice(-8).toUpperCase()}`,
      date: t.paidDate,
      amount: t.amount,
      mode: t.paymentMode,
      feeType: t.feeType,
    };
  }
}

module.exports = new StudentFeesService();
