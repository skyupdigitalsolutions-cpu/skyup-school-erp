'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const baseSchemaPlugin = require('../../../core/baseSchemaPlugin');
const { registerModel } = require('../../../database/modelRegistry');
const { ROLE_VALUES } = require('../../../utils/constants');

const SALT_ROUNDS = 12;

/**
 * User account within a single school (tenant) database. Because tenancy is
 * database-per-school, a user only ever exists inside one school's DB, so email
 * uniqueness is scoped naturally to that school.
 *
 * `roles` is an array of role slugs — a user may hold more than one role
 * (e.g. a teacher who is also a caretaker). Role-based access is driven off
 * this array: the access token carries it and the authorize middleware checks
 * against it.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    // Never returned by default — must be explicitly selected.
    password: { type: String, required: true, select: false, minlength: 8 },
    roles: {
      type: [String],
      enum: ROLE_VALUES,
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'A user must have at least one role.',
      },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true,
    },
    lastLoginAt: { type: Date, default: null },
    // Bumping this invalidates every outstanding refresh token for the user
    // (used on logout and password change).
    tokenVersion: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.plugin(baseSchemaPlugin);

// Unique email among non-deleted users of this school.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } }
);

// Hash the password whenever it is set or changed.
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  return next();
});

/** Constant-time password comparison. */
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

/** Safe projection for API responses (no password, no internal fields). */
userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: String(this._id),
    name: this.name,
    email: this.email,
    roles: this.roles,
    status: this.status,
    lastLoginAt: this.lastLoginAt,
  };
};

// Register so every tenant connection gets a `User` model bound to it.
registerModel('User', userSchema);

module.exports = userSchema;
