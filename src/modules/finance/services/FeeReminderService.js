'use strict';
const ApiError = require('../../../core/ApiError');
const repo = require('../repositories/FeeReminderRepository');
const feeTransactionRepo = require('../repositories/FeeTransactionRepository');
const whatsAppClient = require('../../../integrations/whatsapp/WhatsAppClient');
const { resolveParentContact } = require('../../../utils/studentScope');
const config = require('../../../config');

function studentName(s) {
  return `${s.personal?.firstName || ''} ${s.personal?.lastName || ''}`.trim();
}

/** `month` is 'YYYY-MM'; defaults to the current calendar month. */
function monthRange(month) {
  let year, mon;
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    [year, mon] = month.split('-').map(Number);
  } else {
    const now = new Date();
    year = now.getFullYear();
    mon = now.getMonth() + 1;
  }
  const from = new Date(Date.UTC(year, mon - 1, 1));
  const to = new Date(Date.UTC(year, mon, 0, 23, 59, 59, 999));
  return { from, to };
}

/**
 * Reminders — 'manual_note' logging (unchanged, see FeeReminder.js) plus a
 * real WhatsApp bulk-send path built on `integrations/whatsapp/
 * WhatsAppClient.js`. Every figure here traces to the `FeeTransaction`
 * ledger via `FeeTransactionRepository.dueByStudentInRange` — never a
 * client-supplied amount, never `Student.feeStatus` (the separate,
 * independently-edited snapshot this whole finance feature has consistently
 * avoided as a source of truth).
 */
class FeeReminderService {
  _m(db) { return db.model('FeeReminder'); }

  async list(db, filters, pagination) { return repo.search(this._m(db), filters, pagination); }

  async create(db, payload, actorId) {
    const student = await db.model('Student').findById(payload.student).lean();
    if (!student) throw ApiError.notFound('Student not found.');

    return repo.create(this._m(db), {
      student: payload.student,
      feeTransaction: payload.feeTransaction || null,
      channel: payload.channel || 'manual_note',
      message: payload.message || null,
      status: 'logged',
      sentBy: actorId,
    }, actorId);
  }

  /** GET /finance/reminders/whatsapp-status — lets the UI show "not configured" proactively, before anyone clicks Send. */
  whatsappStatus() {
    return {
      configured: whatsAppClient.isConfigured(),
      templateName: config.notifications.whatsappTemplateName || null,
    };
  }

  /** GET /finance/reminders/due?month=YYYY-MM — every student with a real unpaid amount due that month, with their parent contact. */
  async listDueThisMonth(db, { month } = {}) {
    const { from, to } = monthRange(month);
    const rows = await feeTransactionRepo.dueByStudentInRange(db.model('FeeTransaction'), { from, to });
    if (!rows.length) return [];

    const students = await db.model('Student').find({ _id: { $in: rows.map((r) => r._id) } }).select('personal parent admissionNo academic').lean();
    const byId = new Map(students.map((s) => [String(s._id), s]));

    return rows
      .map((r) => {
        const student = byId.get(String(r._id));
        if (!student) return null; // student since deleted — never surface a dangling id
        return {
          studentId: r._id,
          studentName: studentName(student),
          admissionNo: student.admissionNo,
          parentContact: resolveParentContact(student),
          dueAmount: r.dueAmount,
          feeTypes: r.feeTypes,
          dueDate: r.dueDate,
        };
      })
      .filter(Boolean);
  }

  /**
   * POST /finance/reminders/bulk-send — one WhatsApp template send per
   * student, each with a FRESH ledger recompute (never the client's number)
   * and its own FeeReminder audit row. One student's failure (bad number,
   * provider error, nothing due anymore) never aborts the others.
   */
  async bulkSend(db, { studentIds, month }, actorId) {
    if (!whatsAppClient.isConfigured()) {
      throw ApiError.badRequest("WhatsApp isn't configured yet — set WHATSAPP_API_URL, WHATSAPP_API_TOKEN, WHATSAPP_SENDER_NUMBER, and WHATSAPP_TEMPLATE_NAME to enable bulk sending.");
    }
    if (!studentIds?.length) throw ApiError.badRequest('No students selected.');

    const { from, to } = monthRange(month);
    const templateName = config.notifications.whatsappTemplateName;
    const results = [];

    for (const studentId of studentIds) {
      // eslint-disable-next-line no-await-in-loop
      const result = await this._sendOne(db, { studentId, from, to, templateName, actorId });
      results.push(result);
    }

    return {
      sent: results.filter((r) => r.status === 'sent').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }

  /** @private one student's fresh-recompute-and-send, isolated so a throw here never escapes the batch loop. */
  async _sendOne(db, { studentId, from, to, templateName, actorId }) {
    try {
      const student = await db.model('Student').findById(studentId).select('personal parent').lean();
      if (!student) return { studentId, status: 'failed', errorMessage: 'Student not found.' };

      // Recomputed fresh, right now — never trusts a figure carried over from when the due-list page loaded.
      const [dueRow] = await feeTransactionRepo.dueByStudentInRange(db.model('FeeTransaction'), { from, to, studentId });
      const dueAmount = dueRow?.dueAmount || 0;
      if (!dueAmount) {
        return this._recordAndReturn(db, actorId, {
          student: studentId, status: 'failed', amount: null,
          errorMessage: 'No amount currently due this month (may have been paid since the list was loaded).',
        });
      }

      const contact = resolveParentContact(student);
      if (!contact?.phone) {
        return this._recordAndReturn(db, actorId, {
          student: studentId, status: 'failed', amount: dueAmount,
          errorMessage: 'No WhatsApp-capable phone number on file for this parent contact.',
        });
      }

      const name = studentName(student);
      const send = await whatsAppClient.sendTemplateMessage({
        to: contact.phone,
        templateName,
        variables: [name, dueAmount.toLocaleString('en-IN')],
      });

      return this._recordAndReturn(db, actorId, {
        student: studentId,
        status: send.success ? 'sent' : 'failed',
        amount: dueAmount,
        providerMessageId: send.providerMessageId,
        errorMessage: send.errorMessage,
      });
    } catch (err) {
      return this._recordAndReturn(db, actorId, {
        student: studentId, status: 'failed', amount: null, errorMessage: err.message || 'Unexpected error.',
      });
    }
  }

  /** @private writes the audit row for one student's send attempt and shapes the per-row API result. */
  async _recordAndReturn(db, actorId, { student, status, amount, providerMessageId = null, errorMessage = null }) {
    await repo.create(this._m(db), {
      student, channel: 'whatsapp', message: null, amount, status, providerMessageId, errorMessage, sentBy: actorId,
    }, actorId);
    return { studentId: student, status, errorMessage: errorMessage || undefined };
  }
}

module.exports = new FeeReminderService();
