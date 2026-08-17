'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/SyllabusService');

const getProgress = asyncHandler(async (req, res) => {
  const { classId, section } = req.params;
  const { academicYear } = req.query;
  const data = await svc.getProgress(req.db, req.user, { academicYear, classId, section });
  return ApiResponse.ok(res, data, 'Syllabus progress fetched.');
});

const markProgress = asyncHandler(async (req, res) => {
  const updated = await svc.markProgress(req.db, req.user, req.body);
  return ApiResponse.ok(res, updated, 'Syllabus progress updated.');
});

module.exports = { getProgress, markProgress };
