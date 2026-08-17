'use strict';

const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const studentService = require('../services/StudentService');

/**
 * StudentController — thin handler layer. All logic is in the service.
 * Follows the project pattern: destructure from req, call service, send ApiResponse.
 */

const list = asyncHandler(async (req, res) => {
  const {
    q, academicYear, class: cls, section, house, status, gender,
    transport, hostel, medicalAlert, feeStatus, attendanceBelow,
    admissionFrom, admissionTo,
    page = 1, limit = 20, sort = 'createdAt',
  } = req.query;

  const filters = {
    q, academicYear, class: cls, section, house, status, gender,
    transport, hostel, medicalAlert, feeStatus, attendanceBelow,
    admissionFrom, admissionTo,
  };
  const pagination = { page: Number(page), limit: Number(limit), sort: { [sort]: -1 } };

  const result = await studentService.list(req.db, filters, pagination);
  return ApiResponse.ok(res, result.items, 'Students fetched.', {
    total: result.total,
    page: result.page,
    limit: result.limit,
    pages: result.pages,
  });
});

const stats = asyncHandler(async (req, res) => {
  const data = await studentService.stats(req.db);
  return ApiResponse.ok(res, data, 'Student stats fetched.');
});

const create = asyncHandler(async (req, res) => {
  const student = await studentService.create(req.db, req.body, req.user.id);
  return ApiResponse.created(res, student, 'Student created.');
});

const getById = asyncHandler(async (req, res) => {
  const student = await studentService.getById(req.db, req.params.id);
  return ApiResponse.ok(res, student);
});

const update = asyncHandler(async (req, res) => {
  const student = await studentService.update(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, student, 'Student updated.');
});

const changeStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const student = await studentService.changeStatus(req.db, req.params.id, status, req.user.id);
  return ApiResponse.ok(res, student, `Student status changed to ${status}.`);
});

const archive = asyncHandler(async (req, res) => {
  const student = await studentService.archive(req.db, req.params.id, req.user.id);
  return ApiResponse.ok(res, student, 'Student archived.');
});

const remove = asyncHandler(async (req, res) => {
  const result = await studentService.delete(req.db, req.params.id, req.user.id);
  return ApiResponse.ok(res, result);
});

const bulkPromote = asyncHandler(async (req, res) => {
  const result = await studentService.bulkPromote(req.db, req.body, req.user.id);
  return ApiResponse.ok(res, result, `${result.modifiedCount} student(s) promoted.`);
});

const bulkStatus = asyncHandler(async (req, res) => {
  const result = await studentService.bulkUpdateStatus(req.db, req.body, req.user.id);
  return ApiResponse.ok(res, result, `${result.modifiedCount} student(s) updated.`);
});

const addBehaviourNote = asyncHandler(async (req, res) => {
  const student = await studentService.addBehaviourNote(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, student, 'Behaviour note added.');
});

const addAward = asyncHandler(async (req, res) => {
  const student = await studentService.addAward(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, student, 'Award added.');
});

const addDocument = asyncHandler(async (req, res) => {
  const student = await studentService.addDocument(req.db, req.params.id, req.body, req.user.id);
  return ApiResponse.ok(res, student, 'Document added.');
});

const removeDocument = asyncHandler(async (req, res) => {
  const student = await studentService.removeDocument(req.db, req.params.id, req.params.docId, req.user.id);
  return ApiResponse.ok(res, student, 'Document removed.');
});

const getTimeline = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const logs = await studentService.getTimeline(req.db, req.params.id, {
    page: Number(page),
    limit: Number(limit),
  });
  return ApiResponse.ok(res, logs, 'Timeline fetched.');
});

module.exports = {
  list, stats, create, getById, update, changeStatus, archive, remove,
  bulkPromote, bulkStatus,
  addBehaviourNote, addAward,
  addDocument, removeDocument,
  getTimeline,
};
