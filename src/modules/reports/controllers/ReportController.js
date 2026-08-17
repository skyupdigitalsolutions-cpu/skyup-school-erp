'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ReportService');

const overview = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.overview(req.db), 'Report overview fetched.'));

const teacherReport = asyncHandler(async (req, res) => {
  const { type, from, to, classId } = req.query;
  const data = await svc.teacherReport(req.db, req.user, { type, from, to, classId });
  return ApiResponse.ok(res, data, 'Report fetched.');
});

module.exports = { overview, teacherReport };