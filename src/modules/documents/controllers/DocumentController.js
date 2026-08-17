'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/DocumentService');

const listMine = asyncHandler(async (req, res) => {
  const list = await svc.listMine(req.db, req.user.id, { category: req.query.category });
  return ApiResponse.ok(res, list, 'Documents fetched.');
});

const listShared = asyncHandler(async (req, res) => {
  const list = await svc.listShared(req.db, req.user.id, { category: req.query.category });
  return ApiResponse.ok(res, list, 'Shared documents fetched.');
});

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.user, req.body), 'Document added.'));

const update = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.update(req.db, req.user, req.params.id, req.body), 'Document updated.'));

const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.db, req.user, req.params.id);
  return ApiResponse.noContent(res);
});

module.exports = { listMine, listShared, create, update, remove };
