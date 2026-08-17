'use strict';

const mongoose = require('mongoose');

/**
 * CONTROL-PLANE registry only. This is NOT a business module.
 *
 * Database-per-school tenancy needs a single authoritative map from an
 * incoming request's school identifier to the physical database that holds
 * that school's data. That map lives here, on the control-plane connection.
 *
 * Business-facing school management (onboarding UI, billing, profile, etc.)
 * will be implemented later as its own module and will write to this registry
 * through a repository/service — it does not belong in the foundation.
 */
const tenantSchema = new mongoose.Schema(
  {
    // Public, URL-safe identifier used for tenant resolution (subdomain / header).
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/,
    },
    name: { type: String, required: true, trim: true },

    // Physical database name on the primary cluster for this school.
    dbName: { type: String, required: true, unique: true, trim: true },

    // Optional dedicated cluster URI for large schools placed on their own
    // hardware. When null, the school lives on the primary cluster.
    dbUri: { type: String, default: null },

    status: {
      type: String,
      enum: ['active', 'suspended', 'provisioning', 'archived'],
      default: 'provisioning',
      index: true,
    },
  },
  { timestamps: true, collection: 'tenants' }
);

/**
 * The registry is always bound to the control-plane connection, never to a
 * tenant connection. Callers pass that connection in so this module stays
 * free of hidden global state.
 *
 * @param {import('mongoose').Connection} controlConnection
 * @returns {import('mongoose').Model}
 */
function getTenantModel(controlConnection) {
  return (
    controlConnection.models.Tenant ||
    controlConnection.model('Tenant', tenantSchema)
  );
}

module.exports = { tenantSchema, getTenantModel };
