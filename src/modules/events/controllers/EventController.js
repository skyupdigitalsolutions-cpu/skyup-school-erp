'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/EventService');

const list = asyncHandler(async (req, res) => {
  const { q, status, category, academicYear, department, dateFrom, dateTo, page=1, limit=20, sort='schedule.startDate' } = req.query;
  const result = await svc.list(req.db, { q, status, category, academicYear, department, dateFrom, dateTo }, { page: +page, limit: +limit, sort: { [sort]: 1 } });
  return ApiResponse.ok(res, result.items, 'Events fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const dashboardStats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.dashboardStats(req.db)));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Event created.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const update = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Event updated.'));
const changeStatus = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.changeStatus(req.db, req.params.id, req.body.status, req.user.id, req.body.notes)));
const addFeedback = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.addFeedback(req.db, req.params.id, req.body)));
const addDocument = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.addDocument(req.db, req.params.id, req.body, req.user.id)));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));
const bulkCancel = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.bulkCancel(req.db, req.body, req.user.id)));

module.exports = { list, dashboardStats, create, getById, update, changeStatus, addFeedback, addDocument, remove, bulkCancel };
