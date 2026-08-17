'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentProfileService');

const getMe = asyncHandler(async (req, res) => {
  const student = await svc.getMe(req.db, req.user);
  return ApiResponse.ok(res, student, student ? 'Profile fetched.' : 'No student profile linked to this account.');
});

const updateMe = asyncHandler(async (req, res) => {
  const student = await svc.updateMe(req.db, req.user, req.body);
  return ApiResponse.ok(res, student, 'Profile updated.');
});

module.exports = { getMe, updateMe };
