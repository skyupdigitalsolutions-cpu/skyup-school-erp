'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/CaretakerService');

const list = asyncHandler(async (req, res) => {
  const { q, status, verificationStatus, employmentType, relationship, vehicleAssigned, studentAssigned, page=1, limit=20, sort='createdAt' } = req.query;
  const result = await svc.list(req.db, { q, status, verificationStatus, employmentType, relationship, vehicleAssigned, studentAssigned }, { page: +page, limit: +limit, sort: { [sort]: -1 } });
  return ApiResponse.ok(res, result.items, 'Caretakers fetched.', { total: result.total, page: result.page, limit: result.limit, pages: result.pages });
});
const stats = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.stats(req.db)));
const create = asyncHandler(async (req, res) => ApiResponse.created(res, await svc.create(req.db, req.body, req.user.id), 'Caretaker created.'));
const getById = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.getById(req.db, req.params.id)));
const update = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.update(req.db, req.params.id, req.body, req.user.id), 'Caretaker updated.'));
const changeStatus = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.changeStatus(req.db, req.params.id, req.body.status, req.user.id)));
const verify = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.verify(req.db, req.params.id, req.body.status, req.user.id), 'Verification updated.'));
const assignStudents = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.assignStudents(req.db, req.params.id, req.body.students, req.user.id), 'Students assigned.'));
const addDocument = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.addDocument(req.db, req.params.id, req.body, req.user.id), 'Document added.'));
const remove = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.delete(req.db, req.params.id, req.user.id)));
const bulkStatus = asyncHandler(async (req, res) => ApiResponse.ok(res, await svc.bulkUpdateStatus(req.db, req.body, req.user.id)));

module.exports = { list, stats, create, getById, update, changeStatus, verify, assignStudents, addDocument, remove, bulkStatus };
