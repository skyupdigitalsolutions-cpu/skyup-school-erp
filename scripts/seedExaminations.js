'use strict';

/**
 * Standalone Examination-only seed script.
 *
 * Run with: node scripts/seedExaminations.js
 *
 * This exists ONLY because scripts/seed.js is large enough that verifying a
 * full re-deploy actually landed correctly has been hard to confirm. This
 * file is short and self-contained on purpose — nothing else to get out of
 * sync. It connects to the same 'demo' tenant database, inserts 6
 * Examination documents (one per type/status), and populated marks/results
 * for the completed one across every existing 'demo' student it finds.
 *
 * Safe to re-run — every insert is an upsert keyed by examId.
 */

require('../src/modules/authentication/models/user.model');
require('../src/modules/principal/models/Student');
require('../src/modules/exams/models/Examination');

const logger = require('../src/config/logger');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');

const ACADEMIC_YEAR = '2024-25';
const DAY_MS = 24 * 60 * 60 * 1000;

async function run() {
  await connectionManager.connect();

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOne({ slug: 'demo' });
  if (!tenant) {
    logger.error('No tenant found with slug "demo". Run the main seed.js first to create the school.');
    process.exit(1);
  }

  const db = await connectionManager.getTenantConnection(tenant);
  const Examination = db.model('Examination');
  const Student = db.model('Student');

  const students = await Student.find({ 'academic.class': '8' }).lean();
  logger.info(`Found ${students.length} class-8 student(s) to attach marks/results to.`);

  const now = Date.now();

  const EXAMS = [
    {
      examId: 'EXAM-2024-MIDTERM1', name: 'Term 1 Mid-Term', type: 'mid_term', academicYear: ACADEMIC_YEAR, term: 'Term 1', status: 'scheduled',
      description: 'Mid-term assessment covering the first term syllabus for Class 8.',
      classAllocations: [{ class: '8', sections: ['A'] }],
      timetable: [
        { date: new Date(now + 20 * DAY_MS), subject: 'Mathematics', class: '8', section: 'A', startTime: '09:00', endTime: '11:00', duration: 120, room: 'R-101', invigilators: [{ name: 'Tariq Teacher', employeeId: 'EMP-0001' }], maxMarks: 100, passingMarks: 35 },
        { date: new Date(now + 22 * DAY_MS), subject: 'Science', class: '8', section: 'A', startTime: '09:00', endTime: '11:00', duration: 120, room: 'R-102', invigilators: [{ name: 'Rohan Bhatt', employeeId: 'EMP-0003' }], maxMarks: 100, passingMarks: 35 },
        { date: new Date(now + 24 * DAY_MS), subject: 'English', class: '8', section: 'A', startTime: '09:00', endTime: '11:00', duration: 120, room: 'R-103', invigilators: [{ name: 'Neha Kapoor', employeeId: 'EMP-0002' }], maxMarks: 100, passingMarks: 35 },
      ],
      subjectScheme: [
        { subject: 'Mathematics', class: '8', maxMarks: 100, passingMarks: 35, theoryMarks: 80, practicalMarks: 0, internalMarks: 20 },
        { subject: 'Science', class: '8', maxMarks: 100, passingMarks: 35, theoryMarks: 70, practicalMarks: 20, internalMarks: 10 },
        { subject: 'English', class: '8', maxMarks: 100, passingMarks: 35, theoryMarks: 80, practicalMarks: 0, internalMarks: 20 },
      ],
      rooms: [
        { roomNo: 'R-101', capacity: 30, block: 'Main Block', invigilator: 'Tariq Teacher' },
        { roomNo: 'R-102', capacity: 30, block: 'Science Block', invigilator: 'Rohan Bhatt' },
        { roomNo: 'R-103', capacity: 30, block: 'Main Block', invigilator: 'Neha Kapoor' },
      ],
    },
    {
      examId: 'EXAM-2024-UNITTEST1', name: 'Unit Test 1 - Mathematics', type: 'unit_test', academicYear: ACADEMIC_YEAR, term: 'Term 1', status: 'completed',
      description: 'First unit test covering Rational Numbers and Squares & Square Roots.',
      classAllocations: [{ class: '8', sections: ['A'] }],
      timetable: [
        { date: new Date(now - 15 * DAY_MS), subject: 'Mathematics', class: '8', section: 'A', startTime: '10:00', endTime: '11:00', duration: 60, room: 'R-101', invigilators: [{ name: 'Tariq Teacher', employeeId: 'EMP-0001' }], maxMarks: 50, passingMarks: 18 },
      ],
    },
    {
      examId: 'EXAM-2024-ANNUAL', name: 'Annual Examination', type: 'annual', academicYear: ACADEMIC_YEAR, term: 'Annual', status: 'draft',
      description: 'Draft annual exam plan — timetable not finalized yet.',
      classAllocations: [{ class: '8', sections: ['A'] }],
    },
    {
      examId: 'EXAM-2024-MOCK1', name: 'Class 8 Mock Test', type: 'mock', academicYear: ACADEMIC_YEAR, term: 'Term 1', status: 'ongoing',
      description: 'Practice mock test ahead of the mid-term.',
      classAllocations: [{ class: '8', sections: ['A'] }],
      timetable: [
        { date: new Date(now), subject: 'Mathematics', class: '8', section: 'A', startTime: '09:00', endTime: '10:00', duration: 60, room: 'R-101', invigilators: [{ name: 'Tariq Teacher', employeeId: 'EMP-0001' }], maxMarks: 50, passingMarks: 18 },
      ],
    },
    {
      examId: 'EXAM-2024-INTERNAL1', name: 'Internal Assessment - Science', type: 'internal', academicYear: ACADEMIC_YEAR, term: 'Term 1', status: 'evaluation',
      description: 'Practical and viva internal assessment — marks entry in progress.',
      classAllocations: [{ class: '8', sections: ['A'] }],
      timetable: [
        { date: new Date(now - 3 * DAY_MS), subject: 'Science', class: '8', section: 'A', startTime: '11:00', endTime: '12:00', duration: 60, room: 'Lab-1', invigilators: [{ name: 'Rohan Bhatt', employeeId: 'EMP-0003' }], maxMarks: 30, passingMarks: 12 },
      ],
    },
    {
      examId: 'EXAM-2024-COMPETITIVE1', name: 'Inter-School Olympiad Qualifier', type: 'competitive', academicYear: ACADEMIC_YEAR, status: 'cancelled',
      description: 'Cancelled due to venue unavailability — will be rescheduled next term.',
      classAllocations: [{ class: '8', sections: ['A'] }],
    },
  ];

  let count = 0;
  const examDocsById = new Map();
  for (const e of EXAMS) {
    const doc = await Examination.findOneAndUpdate(
      { examId: e.examId },
      { $set: e },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    examDocsById.set(e.examId, doc);
    count += 1;
    logger.info(`Exam upserted: ${e.examId} (${e.type} / ${e.status})`);
  }

  const unitTest = examDocsById.get('EXAM-2024-UNITTEST1');
  if (unitTest && students.length) {
    const marks = students.map((s, i) => {
      const obtained = 28 + ((i * 7) % 20);
      const grade = obtained >= 40 ? 'A' : obtained >= 34 ? 'B' : 'C';
      return {
        studentId: s._id, admissionNo: s.admissionNo, name: `${s.personal.firstName} ${s.personal.lastName}`,
        class: '8', section: 'A', subject: 'Mathematics', marksObtained: obtained, maxMarks: 50, grade,
      };
    });
    const results = marks.map((m) => ({
      studentId: m.studentId, admissionNo: m.admissionNo, name: m.name,
      class: '8', section: 'A', totalMarks: m.marksObtained, maxTotalMarks: 50,
      percentage: Math.round((m.marksObtained / 50) * 100), grade: m.grade, rank: 0,
      status: m.marksObtained >= 18 ? 'pass' : 'fail',
      subjectWise: [{ subject: 'Mathematics', marks: m.marksObtained, maxMarks: 50, grade: m.grade, status: m.marksObtained >= 18 ? 'pass' : 'fail' }],
      published: true, publishedAt: new Date(now - 10 * DAY_MS),
    }));
    [...results].sort((a, b) => b.totalMarks - a.totalMarks).forEach((r, idx) => { r.rank = idx + 1; });

    await Examination.updateOne({ _id: unitTest._id }, { $set: { marks, results } });
    logger.info(`Marks + results attached to ${unitTest.examId} for ${marks.length} student(s).`);
  }

  const finalCount = await Examination.countDocuments({});
  logger.info(`Done. ${count} exam(s) upserted this run. Total Examination documents in DB now: ${finalCount}.`);

  await connectionManager.closeAll();
  process.exit(0);
}

run().catch((err) => {
  logger.error('seedExaminations failed:');
  logger.error(err.stack || err.message || err);
  process.exit(1);
});
