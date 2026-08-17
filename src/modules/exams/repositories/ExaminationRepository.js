'use strict';
const BaseRepository = require('../../../core/BaseRepository');

class ExaminationRepository extends BaseRepository {
  async search(model, filters = {}, pagination = {}) {
    const q = {};
    if (filters.q) {
      q.$or = [
        { examId: { $regex: filters.q, $options: 'i' } },
        { name: { $regex: filters.q, $options: 'i' } },
      ];
    }
    if (filters.status) q.status = filters.status;
    if (filters.academicYear) q.academicYear = filters.academicYear;
    if (filters.term) q.term = filters.term;
    if (filters.type) q.type = filters.type;
    if (filters.class) q['classAllocations.class'] = filters.class;
    if (filters.dateFrom || filters.dateTo) {
      q['timetable.date'] = {};
      if (filters.dateFrom) q['timetable.date'].$gte = new Date(filters.dateFrom);
      if (filters.dateTo) q['timetable.date'].$lte = new Date(filters.dateTo);
    }
    return this.paginate(model, q, pagination);
  }

  async dashboardStats(model) {
    const now = new Date();
    const [total, upcoming, ongoing, completed] = await Promise.all([
      model.countDocuments({ isDeleted: false }),
      model.countDocuments({ isDeleted: false, status: 'scheduled' }),
      model.countDocuments({ isDeleted: false, status: 'ongoing' }),
      model.countDocuments({ isDeleted: false, status: 'completed' }),
    ]);
    return { total, upcoming, ongoing, completed, evaluation: await model.countDocuments({ isDeleted: false, status: 'evaluation' }) };
  }

  async bulkInsertMarks(model, examId, marksData, actorId) {
    return model.findByIdAndUpdate(
      examId,
      { $push: { marks: { $each: marksData } }, updatedBy: actorId },
      { new: true }
    );
  }

  async publishResults(model, examId, actorId) {
    return model.findByIdAndUpdate(
      examId,
      {
        status: 'completed',
        'results.$[].published': true,
        'results.$[].publishedAt': new Date(),
        updatedBy: actorId,
      },
      { new: true }
    );
  }

  async generateHallTickets(model, examId, students, actorId) {
    return model.findByIdAndUpdate(
      examId,
      { hallTickets: students.map(s => ({ ...s, generated: true, generatedAt: new Date() })), updatedBy: actorId },
      { new: true }
    );
  }
}

module.exports = new ExaminationRepository();
