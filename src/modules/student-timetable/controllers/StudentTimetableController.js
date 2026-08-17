'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentTimetableService');

const getMine = asyncHandler(async (req, res) => {
  const data = await svc.getMyTimetable(req.db, req.user);
  return ApiResponse.ok(res, data, 'Timetable fetched.');
});

module.exports = { getMine };
