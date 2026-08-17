'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/FinanceService');

const dashboardSummary = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.summary(req.db, { academicYear: req.query.academicYear }), 'Finance dashboard summary fetched.'));

module.exports = { dashboardSummary };
