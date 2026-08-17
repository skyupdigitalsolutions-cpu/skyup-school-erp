'use strict';

const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../config/logger');
const { bindModels } = require('./modelRegistry');
const { getTenantModel } = require('./tenantRegistry');

/**
 * Owns all MongoDB connections for the database-per-school architecture.
 *
 *  - ONE primary connection to the cluster. The control-plane database and,
 *    for schools on the shared cluster, every tenant database are addressed
 *    through this single pooled connection via connection.useDb(). This shares
 *    one connection pool across many databases — the recommended pattern for
 *    multi-tenant Atlas deployments.
 *  - Optional DEDICATED connections for schools that carry their own cluster
 *    URI (large schools isolated on their own hardware), created lazily and
 *    cached.
 *
 * Tenant connections have every registered module schema bound to them the
 * first time they are resolved.
 */
class ConnectionManager {
  constructor() {
    /** @type {import('mongoose').Connection|null} */
    this._primary = null;
    /** @type {import('mongoose').Connection|null} */
    this._control = null;
    /** @type {Map<string, import('mongoose').Connection>} */
    this._tenantCache = new Map();
  }

  /** Establish the primary cluster + control-plane connections. Idempotent. */
  async connect() {
    if (this._primary) return this._primary;

    mongoose.set('strictQuery', true);

    this._primary = await mongoose
      .createConnection(config.db.uri, {
        maxPoolSize: 20,
        serverSelectionTimeoutMS: 10000,
      })
      .asPromise();

    this._primary.on('error', (err) =>
      logger.error(`Primary Mongo connection error: ${err.message}`)
    );
    this._primary.on('disconnected', () =>
      logger.warn('Primary Mongo connection disconnected')
    );

    // Control-plane DB shares the primary pool via useDb.
    this._control = this._primary.useDb(config.db.controlPlaneDb, {
      useCache: true,
    });
    // Ensure the tenant registry model is available on the control plane.
    getTenantModel(this._control);

    logger.info('MongoDB primary + control-plane connections established');
    return this._primary;
  }

  /** @returns {import('mongoose').Connection} control-plane connection */
  control() {
    if (!this._control) {
      throw new Error('ConnectionManager.connect() must run before control()');
    }
    return this._control;
  }

  /**
   * Resolve (and cache) a ready-to-use connection for one school, with all
   * registered module models bound.
   * @param {{ slug: string, dbName: string, dbUri?: string|null }} tenant
   * @returns {Promise<import('mongoose').Connection>}
   */
  async getTenantConnection(tenant) {
    if (!tenant || !tenant.dbName) {
      throw new Error('getTenantConnection: tenant.dbName is required');
    }

    const cacheKey = tenant.dbUri
      ? `uri:${tenant.dbName}`
      : `shared:${tenant.dbName}`;

    if (this._tenantCache.has(cacheKey)) {
      return this._tenantCache.get(cacheKey);
    }

    let conn;
    if (tenant.dbUri) {
      // Dedicated cluster for this school.
      conn = await mongoose
        .createConnection(tenant.dbUri, { maxPoolSize: 10 })
        .asPromise();
    } else {
      // Shared cluster — select the school's database on the primary pool.
      if (!this._primary) await this.connect();
      conn = this._primary.useDb(tenant.dbName, { useCache: true });
    }

    bindModels(conn);
    this._tenantCache.set(cacheKey, conn);
    logger.info(`Tenant connection ready: ${tenant.slug} -> ${tenant.dbName}`);
    return conn;
  }

  /** Gracefully close every connection (used on shutdown). */
  async closeAll() {
    for (const conn of this._tenantCache.values()) {
      if (conn.readyState === 1 && conn !== this._primary) {
        // useDb children share the primary pool; only close dedicated ones.
        try {
          await conn.close();
        } catch (_) {
          /* already closing */
        }
      }
    }
    this._tenantCache.clear();
    if (this._primary) {
      await this._primary.close();
      this._primary = null;
      this._control = null;
    }
    logger.info('All MongoDB connections closed');
  }
}

module.exports = new ConnectionManager();
