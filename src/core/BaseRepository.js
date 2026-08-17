'use strict';

/**
 * Repository Pattern base class. Feature repositories extend this to inherit a
 * consistent data-access surface, keeping Mongoose specifics out of the service
 * layer. Every method is tenant-agnostic: the caller supplies the tenant-bound
 * model (resolved from req.db) so a single repository instance is never tied to
 * one school's connection.
 *
 * Example:
 *   class StudentRepository extends BaseRepository {}
 *   const repo = new StudentRepository();
 *   await repo.create(req.db.model('Student'), payload, actorId);
 */
class BaseRepository {
  /**
   * @param {import('mongoose').Model} [model]  optional default model
   */
  constructor(model = null) {
    this.defaultModel = model;
  }

  _model(model) {
    const m = model || this.defaultModel;
    if (!m) throw new Error('BaseRepository: a Mongoose model is required');
    return m;
  }

  async create(model, payload, actorId = null) {
    const m = this._model(model);
    const doc = new m({ ...payload, createdBy: actorId, updatedBy: actorId });
    return doc.save();
  }

  async findById(model, id, { withDeleted = false, populate } = {}) {
    let q = this._model(model).findById(id).setOptions({ withDeleted });
    if (populate) q = q.populate(populate);
    return q.exec();
  }

  async findOne(model, filter = {}, { withDeleted = false, populate } = {}) {
    let q = this._model(model).findOne(filter).setOptions({ withDeleted });
    if (populate) q = q.populate(populate);
    return q.exec();
  }

  /**
   * Paginated list with total count.
   * @returns {Promise<{ items: any[], total: number, page: number, limit: number, pages: number }>}
   */
  async paginate(
    model,
    filter = {},
    { page = 1, limit = 20, sort = { createdAt: -1 }, populate, withDeleted = false } = {}
  ) {
    const m = this._model(model);
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const skip = (safePage - 1) * safeLimit;

    let query = m
      .find(filter)
      .setOptions({ withDeleted })
      .sort(sort)
      .skip(skip)
      .limit(safeLimit);
    if (populate) query = query.populate(populate);

    const [items, total] = await Promise.all([
      query.exec(),
      m.countDocuments(filter).setOptions({ withDeleted }),
    ]);

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  async updateById(model, id, update, actorId = null) {
    return this._model(model)
      .findByIdAndUpdate(
        id,
        { ...update, updatedBy: actorId },
        { new: true, runValidators: true }
      )
      .exec();
  }

  /** Soft delete (default). Requires the baseSchemaPlugin on the model. */
  async softDeleteById(model, id, actorId = null) {
    const doc = await this._model(model).findById(id).exec();
    if (!doc) return null;
    return doc.softDelete(actorId);
  }

  /** Explicit hard delete — use sparingly. */
  async hardDeleteById(model, id) {
    return this._model(model).findByIdAndDelete(id).exec();
  }

  async exists(model, filter) {
    return this._model(model).exists(filter);
  }
}

module.exports = BaseRepository;
