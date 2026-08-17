'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/FinanceService');

const list = asyncHandler(async (req, res) => {
  const { academicYear, feeType, status, student, page = 1, limit = 20 } = req.query;
  const result = await svc.list(req.db, { academicYear, feeType, status, student }, { page: +page, limit: +limit });
  return ApiResponse.ok(res, result.items, 'Fee transactions fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const stats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.stats(req.db, { academicYear: req.query.academicYear })));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Fee transaction recorded.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const update = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Fee transaction updated.'));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));

module.exports = { list, stats, create, getById, update, remove };