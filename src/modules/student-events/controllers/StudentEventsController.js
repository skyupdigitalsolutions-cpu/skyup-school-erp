'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentEventsService');

const listMine = asyncHandler(async (req, res) => {
  const data = await svc.listMyEvents(req.db);
  return ApiResponse.ok(res, data, 'Events fetched.');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await svc.getMyEvent(req.db, req.params.id);
  return ApiResponse.ok(res, data, 'Event fetched.');
});

module.exports = { listMine, getOne };
