'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/HomeworkService');

const listMine = asyncHandler(async (req, res) => {
  const { status, classId } = req.query;
  const list = await svc.listMine(req.db, req.user.id, { status, classId });
  return ApiResponse.ok(res, list, 'Homework fetched.');
});

const getOne = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getOne(req.db, req.user, req.params.id)));

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.user, req.body), 'Homework created.'));

const update = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.update(req.db, req.user, req.params.id, req.body), 'Homework updated.'));

const getSubmissions = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getSubmissions(req.db, req.user, req.params.id), 'Submissions fetched.'));

const gradeSubmission = asyncHandler(async (req, res) =>
  ApiResponse.ok(
    res,
    await svc.gradeSubmission(req.db, req.user, req.params.id, req.params.studentId, req.body),
    'Submission graded.'
  ));

const getAnalytics = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getAnalytics(req.db, req.user, req.params.id), 'Analytics fetched.'));

module.exports = { listMine, getOne, create, update, getSubmissions, gradeSubmission, getAnalytics };
