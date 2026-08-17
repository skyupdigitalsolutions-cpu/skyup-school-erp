'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/AttendanceService');

const getMyClass = asyncHandler(async (req, res) => {
  const data = await svc.getMyClass(req.db, req.user.id);
  return ApiResponse.ok(res, data, data ? 'Class fetched.' : 'You are not a class teacher of any class.');
});

const getRoster = asyncHandler(async (req, res) => {
  const { classId, section } = req.params;
  const { date } = req.query;
  const data = await svc.getRoster(req.db, req.user, { classId, section, date });
  return ApiResponse.ok(res, data, 'Roster fetched.');
});

const mark = asyncHandler(async (req, res) => {
  const data = await svc.markAttendance(req.db, req.user, req.body);
  return ApiResponse.ok(res, data, 'Attendance saved.');
});

const getStudentSummary = asyncHandler(async (req, res) => {
  const { studentId } = req.params;
  const { from, to } = req.query;
  const data = await svc.getStudentSummary(req.db, req.user, { studentId, from, to });
  return ApiResponse.ok(res, data, 'Attendance summary fetched.');
});

module.exports = { getMyClass, getRoster, mark, getStudentSummary };
