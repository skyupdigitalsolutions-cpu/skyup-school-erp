'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/StudentLeaveRequestService');

// ── Parent/student side ──────────────────────────────────────────────────
const create = asyncHandler(async (req, res) =>
  ApiResponse.created(res, await svc.create(req.db, req.user, req.body), 'Leave request submitted.'));

const listMine = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listMine(req.db, req.user), 'Leave requests fetched.'));

const cancelMine = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.cancelMine(req.db, req.user, req.params.id), 'Leave request cancelled.'));

// ── Staff side ────────────────────────────────────────────────────────────
const listForStaff = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listForStaff(req.db, req.user, { status: req.query.status }), 'Student leave requests fetched.'));

const approve = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.decide(req.db, req.user, req.params.id, 'approved', req.body.remarks), 'Leave request approved.'));

const reject = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.decide(req.db, req.user, req.params.id, 'rejected', req.body.remarks), 'Leave request rejected.'));

module.exports = { create, listMine, cancelMine, listForStaff, approve, reject };
