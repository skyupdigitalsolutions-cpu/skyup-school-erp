'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ExaminationService');

const list = asyncHandler(async (req, res) => {
  const { q, status, academicYear, term, type, class: cls, dateFrom, dateTo, page=1, limit=20, sort='createdAt' } = req.query;
  const result = await svc.list(req.db, { q, status, academicYear, term, type, class: cls, dateFrom, dateTo }, { page: +page, limit: +limit, sort: { [sort]: -1 } });
  return ApiResponse.ok(res, result.items, 'Examinations fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const dashboardStats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.dashboardStats(req.db)));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Examination created.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const update = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Examination updated.'));
const changeStatus = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.changeStatus(req.db, req.params.id, req.body.status, req.user.id)));
const enterMarks = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.enterMarks(req.db, req.params.id, req.body.marks, req.user.id), 'Marks entered.'));
const publishResults = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.publishResults(req.db, req.params.id, req.user.id), 'Results published.'));
const generateHallTickets = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.generateHallTickets(req.db, req.params.id, req.body.students, req.user.id), 'Hall tickets generated.'));
const addDocument = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.addDocument(req.db, req.params.id, req.body, req.user.id)));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));

module.exports = { list, dashboardStats, create, getById, update, changeStatus, enterMarks, publishResults, generateHallTickets, addDocument, remove };
