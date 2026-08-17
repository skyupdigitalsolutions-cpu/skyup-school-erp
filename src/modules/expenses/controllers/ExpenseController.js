'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ExpenseService');

const list = asyncHandler(async (req, res) => {
  const { category, academicYear, status, page = 1, limit = 20 } = req.query;
  const result = await svc.list(req.db, { category, academicYear, status }, { page: +page, limit: +limit });
  return ApiResponse.ok(res, result.items, 'Expenses fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});

const stats = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.stats(req.db, { academicYear: req.query.academicYear })));

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Expense recorded.'));

const getById = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));

const reverse = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.reverse(req.db, req.params.id, req.user.id, req.body.remarks), 'Expense reversed.'));

module.exports = { list, stats, create, getById, reverse };
