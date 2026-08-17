'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentExamsService');

const listMyExams = asyncHandler(async (req, res) => {
  const list = await svc.listMyExams(req.db, req.user);
  return ApiResponse.ok(res, list, 'Exams fetched.');
});

const getTimetable = asyncHandler(async (req, res) => {
  const data = await svc.getTimetable(req.db, req.user, req.params.examId);
  return ApiResponse.ok(res, data, 'Exam timetable fetched.');
});

const getAdmitCard = asyncHandler(async (req, res) => {
  const data = await svc.getAdmitCard(req.db, req.user, req.params.examId);
  return ApiResponse.ok(res, data, 'Admit card fetched.');
});

const getResults = asyncHandler(async (req, res) => {
  const data = await svc.getResults(req.db, req.user, req.params.examId);
  return ApiResponse.ok(res, data, data.published ? 'Results fetched.' : 'Results not published yet.');
});

module.exports = { listMyExams, getTimetable, getAdmitCard, getResults };
