'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentAttendanceService');

const getMyAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const data = await svc.getMyAttendance(req.db, req.user, { from, to });
  return ApiResponse.ok(res, data, 'Attendance fetched.');
});

module.exports = { getMyAttendance };
