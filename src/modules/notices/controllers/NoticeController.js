'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/NoticeService');

const list = asyncHandler(async (req, res) => {
  const { q, category, audience, status, page = 1, limit = 20 } = req.query;
  const result = await svc.list(req.db, { q, category, audience, status }, { page: +page, limit: +limit });
  return ApiResponse.ok(res, result.items, 'Notices fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const stats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.stats(req.db)));
const latest = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.latest(req.db, +req.query.limit || 5)));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Notice published.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const update = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Notice updated.'));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));

module.exports = { list, stats, latest, create, getById, update, remove };