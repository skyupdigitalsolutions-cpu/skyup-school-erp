'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/ClassTeacherService');

const getMyClass = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getMyClass(req.db, req.user.id), 'Class fetched.'));

const getStudentProfile = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getStudentProfile(req.db, req.user, req.params.studentId), 'Student profile fetched.'));

const getReportCard = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getReportCard(req.db, req.user, req.params.studentId), 'Report card fetched.'));

const listBehaviourNotes = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listBehaviourNotes(req.db, req.user.id, { studentId: req.query.studentId }), 'Behaviour notes fetched.'));

const createBehaviourNote = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.createBehaviourNote(req.db, req.user, req.body), 'Behaviour note added.'));

module.exports = { getMyClass, getStudentProfile, getReportCard, listBehaviourNotes, createBehaviourNote };
