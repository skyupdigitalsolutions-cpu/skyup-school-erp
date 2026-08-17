'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/TimetableService');

const getMine = asyncHandler(async (req, res) => {
  const grid = await svc.getMine(req.db, req.user.id);
  return ApiResponse.ok(res, grid, 'Timetable fetched.');
});

const getForClassSection = asyncHandler(async (req, res) => {
  const { classId, section } = req.params;
  const { academicYear } = req.query;
  const grid = await svc.getForClassSection(req.db, req.user, { academicYear, classId, section });
  return ApiResponse.ok(res, grid, 'Class timetable fetched.');
});

const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Timetable entry created.'));

const bulkCreate = asyncHandler(async (req, res) => {
  const result = await svc.bulkCreate(req.db, req.body.entries, req.user.id);
  return ApiResponse.created(
    res,
    result,
    `${result.created.length} entr${result.created.length === 1 ? 'y' : 'ies'} created, ${result.skipped.length} skipped.`
  );
});

module.exports = { getMine, getForClassSection, create, bulkCreate };
