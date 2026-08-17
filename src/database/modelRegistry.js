'use strict';

/**
 * Central registry of tenant-scoped models.
 *
 * In a database-per-school architecture, every school gets its own physical
 * database, and each of those databases needs the SAME set of collections.
 * Rather than importing models against a single global connection (the
 * Mongoose default), each feature module registers a { name, schema } pair
 * here at boot time. The connection manager then binds every registered
 * schema onto each tenant connection the first time that tenant is used.
 *
 * This keeps the foundation free of any business schema while giving every
 * future module a single, well-defined seam to plug into:
 *
 *   // inside a module, at import time:
 *   const { registerModel } = require('../../../database/modelRegistry');
 *   registerModel('Student', studentSchema);
 *
 * The foundation ships with an EMPTY registry by design — no invented
 * business models.
 */
const registry = new Map();

/**
 * Register a tenant-scoped schema under a unique model name.
 * @param {string} name  Mongoose model name (unique per tenant DB)
 * @param {import('mongoose').Schema} schema
 */
function registerModel(name, schema) {
  if (!name || typeof name !== 'string') {
    throw new Error('registerModel: model name must be a non-empty string');
  }
  if (registry.has(name)) {
    throw new Error(`registerModel: model "${name}" is already registered`);
  }
  registry.set(name, schema);
}

/**
 * Bind every registered schema onto a given tenant connection.
 * Idempotent — re-binding an existing model on a connection is a no-op.
 * @param {import('mongoose').Connection} connection
 */
function bindModels(connection) {
  for (const [name, schema] of registry.entries()) {
    if (!connection.models[name]) {
      connection.model(name, schema);
    }
  }
  return connection;
}

/** @returns {string[]} names of all registered models */
function registeredModelNames() {
  return [...registry.keys()];
}

module.exports = { registerModel, bindModels, registeredModelNames };
