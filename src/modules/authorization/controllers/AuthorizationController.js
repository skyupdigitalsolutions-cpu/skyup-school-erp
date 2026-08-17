'use strict';
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const svc = require('../services/AuthorizationService');

const listRoles = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.listRolePermissions(req.db), 'Role permissions fetched.'));

const updateRole = asyncHandler(async (req, res) =>
  ApiResponse.ok(res, await svc.updateRolePermissions(req.db, req.params.role, req.body.permissions, req.user.id), 'Role permissions updated.'));

module.exports = { listRoles, updateRole };
