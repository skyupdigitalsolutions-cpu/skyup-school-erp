'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/SubjectService');

const list = asyncHandler(async (req, res) => {
  const { q, grade, status, page = 1, limit = 20 } = req.query;
  const result = await svc.list(req.db, { q, grade, status }, { page: +page, limit: +limit });
  return ApiResponse.ok(res, result.items, 'Subjects fetched.', {
    total: result.total, page: result.page, limit: result.limit, pages: result.pages,
  });
});

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Subject created.'));

const getById = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));

const update = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Subject updated.'));

const archive = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.archive(req.db, req.params.id, req.user.id), 'Subject archived.'));

const getTopicTree = asyncHandler(async (req, res) => {
  const { grade, academicYear } = req.query;
  const tree = await svc.getTopicTree(req.db, req.params.id, { grade, academicYear });
  return ApiResponse.ok(res, tree, 'Syllabus tree fetched.');
});

const createTopic = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.createTopic(req.db, req.params.id, req.body, req.user.id), 'Syllabus topic created.'));

const updateTopic = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.updateTopic(req.db, req.params.id, req.params.topicId, req.body, req.user.id), 'Syllabus topic updated.'));

const archiveTopic = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.archiveTopic(req.db, req.params.id, req.params.topicId, req.user.id)));

module.exports = { list, create, getById, update, archive, getTopicTree, createTopic, updateTopic, archiveTopic };
