'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/TeacherClassService');

const getMine = asyncHandler(async (req, res) => {
  const classes = await svc.getMyClasses(req.db, req.user.id);
  return ApiResponse.ok(res, classes, 'Classes fetched.');
});

const getRoster = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { section } = req.query;
  const data = await svc.getRoster(req.db, req.user, { classId, section });
  return ApiResponse.ok(res, data, 'Roster fetched.');
});

const getStudentProfile = asyncHandler(async (req, res) => {
  const { classId, studentId } = req.params;
  const { section } = req.query;
  const data = await svc.getStudentProfile(req.db, req.user, { classId, section, studentId });
  return ApiResponse.ok(res, data, 'Student profile fetched.');
});

const getStats = asyncHandler(async (req, res) => {
  const { classId } = req.params;
  const { section } = req.query;
  const data = await svc.getStats(req.db, req.user, { classId, section });
  return ApiResponse.ok(res, data, 'Class stats fetched.');
});

module.exports = { getMine, getRoster, getStudentProfile, getStats };
