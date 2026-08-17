'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/CalendarService');

const getMine = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const data = await svc.getAggregate(req.db, req.user.id, { from, to });
  return ApiResponse.ok(res, data, 'Calendar fetched.');
});

const createReminder = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.createReminder(req.db, req.user, req.body), 'Reminder created.'));

const updateReminder = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.updateReminder(req.db, req.user, req.params.id, req.body), 'Reminder updated.'));

const deleteReminder = asyncHandler(async (req, res) => {
  await svc.deleteReminder(req.db, req.user, req.params.id);
  return ApiResponse.noContent(res);
});

module.exports = { getMine, createReminder, updateReminder, deleteReminder };
