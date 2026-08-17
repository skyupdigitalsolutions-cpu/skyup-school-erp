'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentTransportService');

const getMine = asyncHandler(async (req, res) => {
  const data = await svc.getMyTransport(req.db, req.user);
  return ApiResponse.ok(res, data, 'Transport details fetched.');
});

const getLiveTrip = asyncHandler(async (req, res) => {
  const data = await svc.getLiveTrip(req.db, req.user);
  return ApiResponse.ok(res, data, data.active ? 'Live trip fetched.' : 'No trip in progress.');
});

module.exports = { getMine, getLiveTrip };
