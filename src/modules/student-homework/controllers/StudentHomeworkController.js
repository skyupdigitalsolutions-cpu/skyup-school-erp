'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentHomeworkService');

const listMine = asyncHandler(async (req, res) => {
  const { status, from, to } = req.query;
  const list = await svc.listMine(req.db, req.user, { status, from, to });
  return ApiResponse.ok(res, list, 'Homework fetched.');
});

module.exports = { listMine };
