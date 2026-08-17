'use strict';

const mongoose = require('mongoose');

/**
 * Applied to EVERY tenant-scoped schema so the audit/soft-delete contract from
 * the project charter is enforced uniformly instead of copy-pasted per model:
 *
 *   - createdBy / updatedBy / deletedBy  (actor references)
 *   - createdAt / updatedAt              (via timestamps)
 *   - isDeleted / deletedAt              (soft delete)
 *   - __v optimistic concurrency         (versioning, Mongoose default)
 *
 * It also excludes soft-deleted documents from ordinary reads by default, and
 * exposes a softDelete() instance method. Hard deletes remain possible but must
 * be explicit, keeping accidental data loss out of the default path.
 *
 * @param {mongoose.Schema} schema
 * @param {object} [options]
 * @param {string} [options.actorRef='User'] model name for actor references
 */
function baseSchemaPlugin(schema, options = {}) {
  const actorRef = options.actorRef || 'User';

  schema.add({
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: actorRef, default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: actorRef, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: actorRef, default: null },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  });

  // Ensure createdAt / updatedAt without overriding a schema that set its own.
  if (!schema.options.timestamps) {
    schema.set('timestamps', true);
  }

  // Exclude soft-deleted docs from every find* unless explicitly overridden.
  const READ_HOOKS = [
    'find',
    'findOne',
    'findOneAndUpdate',
    'countDocuments',
    'count',
  ];
  READ_HOOKS.forEach((hook) => {
    schema.pre(hook, function applyNotDeleted(next) {
      const filter = this.getFilter();
      if (filter.isDeleted === undefined && !this.getOptions().withDeleted) {
        this.where({ isDeleted: false });
      }
      next();
    });
  });

  /**
   * Soft-delete this document, recording who performed it.
   * @param {mongoose.Types.ObjectId|string|null} actorId
   */
  schema.methods.softDelete = function softDelete(actorId = null) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = actorId;
    return this.save();
  };

  /** Restore a soft-deleted document. */
  schema.methods.restore = function restore(actorId = null) {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    this.updatedBy = actorId;
    return this.save();
  };
}

module.exports = baseSchemaPlugin;
