'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/LeaveService');

const list = asyncHandler(async (req, res) => {
  const { status, applicantType, leaveType, applicant, page = 1, limit = 20 } = req.query;
  const result = await svc.list(req.db, { status, applicantType, leaveType, applicant }, { page: +page, limit: +limit });
  return ApiResponse.ok(res, result.items, 'Leave requests fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const stats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.stats(req.db)));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Leave request submitted.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const approve = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.decide(req.db, req.params.id, 'approved', req.body.remarks, req.user.id), 'Leave approved.'));
const reject = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.decide(req.db, req.params.id, 'rejected', req.body.remarks, req.user.id), 'Leave rejected.'));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));

module.exports = { list, stats, create, getById, approve, reject, remove };