'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ClassService');

const list = asyncHandler(async (req, res) => {
  const { q, academicYear, status, page = 1, limit = 20, sort = 'name' } = req.query;
  const result = await svc.list(req.db, { q, academicYear, status }, { page: +page, limit: +limit, sort: { [sort]: 1 } });
  return ApiResponse.ok(res, result.items, 'Classes fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const stats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.stats(req.db)));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Class created.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const update = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Class updated.'));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));

module.exports = { list, stats, create, getById, update, remove };