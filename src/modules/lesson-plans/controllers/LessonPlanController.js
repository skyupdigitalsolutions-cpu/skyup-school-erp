'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/LessonPlanService');

const listMine = asyncHandler(async (req, res) => {
  const { from, to, classId, status } = req.query;
  const list = await svc.listMine(req.db, req.user.id, { from, to, classId, status });
  return ApiResponse.ok(res, list, 'Lesson plans fetched.');
});

const getOne = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getOne(req.db, req.user, req.params.id)));

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.user, req.body), 'Lesson plan created.'));

const update = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.update(req.db, req.user, req.params.id, req.body), 'Lesson plan updated.'));

const review = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.review(req.db, req.user, req.params.id, req.body), 'Lesson plan reviewed.'));

module.exports = { listMine, getOne, create, update, review };
