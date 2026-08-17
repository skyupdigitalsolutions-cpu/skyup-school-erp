'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudyMaterialService');

const listMine = asyncHandler(async (req, res) => {
  const { type, subject, classId } = req.query;
  const list = await svc.listMine(req.db, req.user.id, { type, subject, classId });
  return ApiResponse.ok(res, list, 'Study material fetched.');
});

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.user, req.body), 'Study material added.'));

const update = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.update(req.db, req.user, req.params.id, req.body), 'Study material updated.'));

const remove = asyncHandler(async (req, res) => {
  await svc.remove(req.db, req.user, req.params.id);
  return ApiResponse.noContent(res);
});

module.exports = { listMine, create, update, remove };
