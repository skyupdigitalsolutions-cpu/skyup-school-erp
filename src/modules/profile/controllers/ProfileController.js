'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ProfileService');

const getMe = asyncHandler(async (req, res) => {
  const teacher = await svc.getMe(req.db, req.user.id);
  return ApiResponse.ok(res, teacher, teacher ? 'Profile fetched.' : 'No teacher profile linked to this account.');
});

const updateMe = asyncHandler(async (req, res) => {
  const teacher = await svc.updateMe(req.db, req.user.id, req.body);
  return ApiResponse.ok(res, teacher, 'Profile updated.');
});

const changePassword = asyncHandler(async (req, res) => {
  const result = await svc.changePassword(req.db, req.user.id, req.body);
  return ApiResponse.ok(res, result, 'Password changed.');
});

module.exports = { getMe, updateMe, changePassword };
