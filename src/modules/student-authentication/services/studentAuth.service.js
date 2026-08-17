'use strict';
const ApiError = require('../../../core/ApiError');
const tokenService = require('../../authentication/services/token.service');

function studentName(s) {
  return `${s.personal?.firstName || ''} ${s.personal?.lastName || ''}`.trim();
}

/** The viewer shape returned by login/refresh/me — student basic info + viewerType. */
function toViewer(account, student) {
  return {
    id: String(account._id),
    viewerType: account.viewerType,
    roles: [account.viewerType],
    studentId: String(student._id),
    name: studentName(student),
    admissionNo: student.admissionNo,
    rollNo: student.rollNo,
    className: student.academic?.class || null,
    section: student.academic?.section || null,
    photo: student.photo || null,
  };
}

const StudentAuthService = {
  async login({ db, tenant, email, password }) {
    const StudentAccount = db.model('StudentAccount');
    const account = await StudentAccount.findOne({ email: String(email).toLowerCase() }).select('+password');
    if (!account) throw ApiError.unauthorized('Invalid email or password.');

    const matches = await account.comparePassword(password);
    if (!matches) throw ApiError.unauthorized('Invalid email or password.');
    if (!account.isActive) throw ApiError.forbidden('Account is inactive. Contact your school.');

    const student = await db.model('Student').findById(account.student).lean();
    if (!student) throw ApiError.unauthorized('Invalid email or password.');

    account.lastLoginAt = new Date();
    await account.save();

    const tokens = this._issueTokens(account, student, tenant);
    return { viewer: toViewer(account, student), ...tokens };
  },

  async refresh({ db, tenant, decoded }) {
    const StudentAccount = db.model('StudentAccount');
    const account = await StudentAccount.findById(decoded.sub);
    if (!account || !account.isActive) throw ApiError.unauthorized('Session is no longer valid.');
    if (decoded.ver !== account.tokenVersion) throw ApiError.unauthorized('Session has expired. Please sign in again.');

    const student = await db.model('Student').findById(account.student).lean();
    if (!student) throw ApiError.unauthorized('Session is no longer valid.');

    const tokens = this._issueTokens(account, student, tenant);
    return { viewer: toViewer(account, student), ...tokens };
  },

  async logout({ db, accountId }) {
    await db.model('StudentAccount').updateOne({ _id: accountId }, { $inc: { tokenVersion: 1 } });
  },

  async me({ db, accountId }) {
    const account = await db.model('StudentAccount').findById(accountId);
    if (!account) throw ApiError.notFound('Account not found.');
    const student = await db.model('Student').findById(account.student).lean();
    if (!student) throw ApiError.notFound('Student not found.');
    return toViewer(account, student);
  },

  _issueTokens(account, student, tenant) {
    const accessToken = tokenService.signAccessToken({
      userId: String(account._id),
      tenantId: tenant.id,
      roles: [account.viewerType],
      permissions: [],
      extra: { studentId: String(student._id), viewerType: account.viewerType },
    });
    const refreshToken = tokenService.signRefreshToken({
      userId: String(account._id),
      tenantId: tenant.id,
      tokenVersion: account.tokenVersion,
    });
    return { accessToken, refreshToken };
  },
};

module.exports = StudentAuthService;
