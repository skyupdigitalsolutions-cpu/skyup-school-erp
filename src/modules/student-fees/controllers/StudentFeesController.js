'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentFeesService');

const getMine = asyncHandler(async (req, res) => {
  const data = await svc.getMyFees(req.db, req.user);
  return ApiResponse.ok(res, data, 'Fees fetched.');
});

module.exports = { getMine };
