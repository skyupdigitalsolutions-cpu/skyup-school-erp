'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class NoticeRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.q) q.title = { $regex: filters.q, $options: 'i' };
    if (filters.category) q.category = filters.category;
    if (filters.audience) q.audience = filters.audience;
    if (filters.status) q.status = filters.status;
    else q.status = { $ne: 'archived' };
    return this.paginate(model, q, { ...pagination, sort: pagination.sort || { pinned: -1, publishedDate: -1 } });
  }

  async stats(model) {
    const [total, published, pinned, urgent] = await Promise.all([
      model.countDocuments({ isDeleted: false }),
      model.countDocuments({ isDeleted: false, status: 'published' }),
      model.countDocuments({ isDeleted: false, pinned: true, status: 'published' }),
      model.countDocuments({ isDeleted: false, priority: 'high', status: 'published' }),
    ]);
    return { total, published, pinned, urgent };
  }

  async latest(model, limit = 5) {
    return model.find({ isDeleted: false, status: 'published' })
      .sort({ pinned: -1, publishedDate: -1 })
      .limit(limit)
      .lean();
  }
}

module.exports = new NoticeRepository();