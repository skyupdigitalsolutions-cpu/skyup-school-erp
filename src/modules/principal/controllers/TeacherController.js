'use strict';

const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const teacherService = require('../services/TeacherService');

const list = asyncHandler(async (req, res) => {
  const {
    q, department, designation, employmentType, status, subject,
    class: cls, academicYear, joiningFrom, joiningTo,
    experienceMin, experienceMax, attendanceBelow, performanceAbove,
    page = 1, limit = 20, sort = 'createdAt',
  } = req.query;

  const filters = {
    q, department, designation, employmentType, status, subject,
    class: cls, academicYear, joiningFrom, joiningTo,
    experienceMin, experienceMax, attendanceBelow, performanceAbove,
  };
  const pagination = { page: Number(page), limit: Number(limit), sort: { [sort]: -1 } };

  const result = await teacherService.list(req.db, filters, pagination);
  return ApiResponse.ok(res, result.items, 'Teachers fetched.', {
    total: result.total,
    page: result.page,
    limit: result.limit,
    pages: result.pages,
  });
});

const dashboardStats = asyncHandler(async (req, res) => {
  const data = await teacherService.dashboardStats(req.db);
  return ApiResponse.ok(res, data, 'Teacher dashboard stats fetched.');
});

const create = asyncHandler(async (req, res) => {
  const teacher = await teacherService.create(req.db, req.body, req.user.id);
  return ApiResponse.created(res, teacher, 'Teacher created.');
});

const getById = asyncHandler(async (req, res) => {
  const teacher = await teacherService.getById(req.db, req.params.id);
  return ApiResponse.ok(res, teacher);
});

const update = asyncHandler(async (req, res) => {
  const teacher = await teacherService.update(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, teacher, 'Teacher updated.');
});

const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const teacher = await teacherService.changeStatus(req.db, req.params.id, status, req.user.id);
  return ApiResponse.ok(res, teacher, `Teacher status changed to ${status}.`);
});

const archive = asyncHandler(async (req, res) => {
  const teacher = await teacherService.archive(req.db, req.params.id, req.user.id);
  return ApiResponse.ok(res, teacher, 'Teacher archived.');
});

const remove = asyncHandler(async (req, res) => {
  const result = await teacherService.delete(req.db, req.params.id, req.user.id);
  return ApiResponse.ok(res, result);
});

const assignSubjects = asyncHandler(async (req, res) => {
  const teacher = await teacherService.assignSubjects(req.db, req.params.id, req.body.subjects, req.user.id);
  return ApiResponse.ok(res, teacher, 'Subjects assigned.');
});

const addPerformanceReview = asyncHandler(async (req, res) => {
  const teacher = await teacherService.addPerformanceReview(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, teacher, 'Performance review added.');
});

const addDocument = asyncHandler(async (req, res) => {
  const teacher = await teacherService.addDocument(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, teacher, 'Document added.');
});

const removeDocument = asyncHandler(async (req, res) => {
  const teacher = await teacherService.removeDocument(req.db, req.params.id, req.params.docId, req.user.id);
  return ApiResponse.ok(res, teacher, 'Document removed.');
});

const assignAsset = asyncHandler(async (req, res) => {
  const teacher = await teacherService.assignAsset(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, teacher, 'Asset assigned.');
});

const updateAiInsights = asyncHandler(async (req, res) => {
  const teacher = await teacherService.updateAiInsights(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, teacher, 'AI insights updated.');
});

const bulkStatus = asyncHandler(async (req, res) => {
  const result = await teacherService.bulkUpdateStatus(req.db, req.body, req.user.id);
  return ApiResponse.ok(res, result, `${result.modifiedCount} teacher(s) updated.`);
});

const getTimeline = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const logs = await teacherService.getTimeline(req.db, req.params.id, {
    page: Number(page),
    limit: Number(limit),
  });
  return ApiResponse.ok(res, logs, 'Timeline fetched.');
});

module.exports = {
  list, dashboardStats, create, getById, update, changeStatus, archive, remove,
  assignSubjects, addPerformanceReview,
  addDocument, removeDocument,
  assignAsset, updateAiInsights,
  bulkStatus, getTimeline,
};
