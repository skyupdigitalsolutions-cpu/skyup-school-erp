'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');

const SALT_ROUNDS = 12;

/**
 * A login credential for the family-facing portal. Deliberately a SEPARATE
 * collection from `User` (the staff login): a single student can have BOTH a
 * parent account and a student account pointing at the same `student` — a
 * relationship the staff side's 1:1 `Teacher.userId` pattern can't express.
 *
 * `viewerType` is the child-data safeguard this whole model exists for: same
 * portal, but a `student` viewer must never see family fee dues — see
 * `src/utils/studentScope.js`'s `canSeeFees`. Hashing/tokens reuse the exact
 * same mechanism as `User` (bcrypt cost 12, same JWT secrets via
 * token.service.js) — this is not a second auth system, just a second
 * credential store behind it.
 */
const studentAccountSchema = new mongoose.Schema(
  {
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
    viewerType: { type: String, enum: ['parent', 'student'], required: true },
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 160 },
    // Never returned by default — must be explicitly selected.
    password: { type: String, required: true, select: false, minlength: 8 },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    // Bumping this invalidates every outstanding refresh token (logout / password change).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

studentAccountSchema.plugin(baseSchemaPlugin);

// Unique email among non-deleted accounts of this school.
studentAccountSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
// At most one parent account and one student account per student.
studentAccountSchema.index(
  { student: 1, viewerType: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

studentAccountSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  return next();
});

studentAccountSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

registerModel('StudentAccount', studentAccountSchema);
module.exports = studentAccountSchema;
