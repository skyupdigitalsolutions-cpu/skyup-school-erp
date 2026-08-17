'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentDashboardService');

const getMine = asyncHandler(async (req, res) => {
  const data = await svc.getDashboard(req.db, req.user);
  return ApiResponse.ok(res, data, 'Dashboard fetched.');
});

module.exports = { getMine };
