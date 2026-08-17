'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/CaretakerTransportService');

const getMyRoutes = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getMyRoutes(req.db, req.user), 'Routes fetched.'));

const startTrip = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.startTrip(req.db, req.user, req.body), 'Trip started.'));

const arriveTrip = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.arriveTrip(req.db, req.user, req.params.id), 'Trip completed.'));

const logStudent = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.logStudent(req.db, req.user, req.params.id, req.body), 'Student log recorded.'));

const listTrips = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listTrips(req.db, req.user, { date: req.query.date }), 'Trips fetched.'));

const getProfile = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.getProfile(req.db, req.user), 'Profile fetched.'));

const updateProfile = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.updateProfile(req.db, req.user, req.body), 'Profile updated.'));

const listActiveTrips = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listActiveTrips(req.db, req.user), 'Active trips fetched.'));

module.exports = { getMyRoutes, startTrip, arriveTrip, logStudent, listTrips, getProfile, updateProfile, listActiveTrips };
