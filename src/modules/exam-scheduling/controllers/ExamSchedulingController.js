'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ExamSchedulingService');

const listExams = asyncHandler(async (req, res) => {
  const { academicYear, status, classId, page = 1, limit = 20 } = req.query;
  const result = await svc.listExams(req.db, { academicYear, status, classId }, { page, limit });
  return ApiResponse.ok(res, result.items, 'Exams fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});

const createExam = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.createExam(req.db, req.body, req.user.id), 'Exam created.'));

const getExam = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getExam(req.db, req.params.id)));

const updateExam = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.updateExam(req.db, req.params.id, req.body, req.user.id), 'Exam updated.'));

const changeExamStatus = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.changeExamStatus(req.db, req.params.id, req.body.status, req.user.id), 'Exam status updated.'));

const deleteExam = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.deleteExam(req.db, req.params.id, req.user.id)));

const getSchedule = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getSchedule(req.db, req.user, req.params.id), 'Exam schedule fetched.'));

const addScheduleRow = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.addScheduleRow(req.db, req.params.id, req.body, req.user.id), 'Exam schedule entry created.'));

const updateScheduleRow = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.updateScheduleRow(req.db, req.params.scheduleId, req.body, req.user.id), 'Exam schedule entry updated.'));

const deleteScheduleRow = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.deleteScheduleRow(req.db, req.params.scheduleId, req.user.id)));

const getMarksSheet = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getMarksSheet(req.db, req.user, req.params.scheduleId), 'Marks sheet fetched.'));

const enterMarks = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.enterMarks(req.db, req.user, req.params.scheduleId, req.body.records, req.user.id), 'Marks saved.'));

module.exports = {
  listExams, createExam, getExam, updateExam, changeExamStatus, deleteExam,
  getSchedule, addScheduleRow, updateScheduleRow, deleteScheduleRow,
  getMarksSheet, enterMarks,
};
