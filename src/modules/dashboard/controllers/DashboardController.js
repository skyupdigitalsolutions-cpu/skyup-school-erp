'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/DashboardService');

const summary = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.summary(req.db), 'Dashboard summary fetched.'));

const teacherSummary = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.teacherSummary(req.db, req.user.id), 'Teacher dashboard fetched.'));

module.exports = { summary, teacherSummary };