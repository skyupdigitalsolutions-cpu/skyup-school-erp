'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/FeeReminderService');

const list = asyncHandler(async (req, res) => {
  const { student, page = 1, limit = 20 } = req.query;
  const result = await svc.list(req.db, { student }, { page: +page, limit: +limit });
  return ApiResponse.ok(res, result.items, 'Reminders fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Reminder logged.'));

const due = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listDueThisMonth(req.db, { month: req.query.month }), 'Due students fetched.'));

const whatsappStatus = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, svc.whatsappStatus(), 'WhatsApp status fetched.'));

const bulkSend = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.bulkSend(req.db, req.body, req.user.id), 'Bulk send complete.'));

module.exports = { list, create, due, whatsappStatus, bulkSend };
