'use strict';

// DEVELOPMENT SEED — do not run against production data.
// Creates School Code "demo", one active user per role in that school's DB,
// plus a small curriculum spine (Subjects, SyllabusTopics, a Class/section,
// TimetableEntry rows for the seeded teacher, and one SyllabusProgress row)
// so the timetable/syllabus modules have something to serve out of the box.
// Usage: node scripts/seed.js   (or: npm run seed)

const config = require('../src/config');
const logger = require('../src/config/logger');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');
const { ROLES } = require('../src/utils/constants');

// Requiring each model registers its schema so it binds onto every tenant DB.
require('../src/modules/authentication/models/user.model');
require('../src/modules/classes/models/Class');
require('../src/modules/principal/models/Teacher');
require('../src/modules/subjects/models/Subject');
require('../src/modules/subjects/models/SyllabusTopic');
require('../src/modules/timetable/models/TimetableEntry');
require('../src/modules/syllabus/models/SyllabusProgress');
require('../src/modules/principal/models/Student');
require('../src/modules/attendance/models/Attendance');
require('../src/modules/notices/models/Notice');
require('../src/modules/homework/models/Homework');
require('../src/modules/homework/models/Submission');
require('../src/modules/study-material/models/StudyMaterial');
require('../src/modules/documents/models/Document');
require('../src/modules/student-authentication/models/StudentAccount');
require('../src/modules/finance/models/FeeTransaction');
require('../src/modules/exam-scheduling/models/Exam');
require('../src/modules/exam-scheduling/models/ExamSchedule');
require('../src/modules/exam-scheduling/models/ExamMark');
require('../src/modules/events/models/Event');
require('../src/modules/caretaker/models/Caretaker');
require('../src/modules/caretaker-transport/models/BusTrip');
require('../src/modules/caretaker-transport/models/BusTripStudentLog');
require('../src/modules/leave-management/models/LeaveRequest');
require('../src/modules/exams/models/Examination');

const SCHOOL = {
  slug: 'demo',
  name: 'Demo School',
  dbName: `${config.db.tenantDbPrefix}demo`,
  status: 'active',
};

const DEFAULT_PASSWORD = 'Password123!';
const ACADEMIC_YEAR = '2024-25';

const USERS = [
  { name: 'Ada Administrator', email: 'admin@demo.school', roles: [ROLES.ADMINISTRATOR] },
  { name: 'Priya Principal', email: 'principal@demo.school', roles: [ROLES.PRINCIPAL] },
  { name: 'Tariq Teacher', email: 'teacher@demo.school', roles: [ROLES.TEACHER] },
  { name: 'Carla Caretaker', email: 'caretaker@demo.school', roles: [ROLES.CARETAKER] },
  { name: 'Sam Student', email: 'student@demo.school', roles: [ROLES.STUDENT] },
  { name: 'Fatima Finance', email: 'finance@demo.school', roles: [ROLES.FINANCE] },
];

const SUBJECTS = [
  { name: 'Mathematics', code: 'MATH8', grades: ['8'], description: 'Grade 8 Mathematics' },
  { name: 'Science', code: 'SCI8', grades: ['8'], description: 'Grade 8 Science' },
  { name: 'English', code: 'ENG8', grades: ['8'], description: 'Grade 8 English' },
];

/** Small unit -> chapter tree for Mathematics, grade 8. */
const MATH_SYLLABUS = [
  {
    title: 'Unit 1: Number Systems',
    sequence: 1,
    plannedPeriods: 2,
    children: [
      { title: 'Rational Numbers', sequence: 1, plannedPeriods: 4 },
      { title: 'Squares and Square Roots', sequence: 2, plannedPeriods: 5 },
    ],
  },
  {
    title: 'Unit 2: Algebra',
    sequence: 2,
    plannedPeriods: 2,
    children: [
      { title: 'Linear Equations in One Variable', sequence: 1, plannedPeriods: 6 },
      { title: 'Factorisation', sequence: 2, plannedPeriods: 5 },
    ],
  },
];

/** Second subject's tree — gives Lesson Planning's topic-tagging picker a second real subject to pick from. */
const SCIENCE_SYLLABUS = [
  {
    title: 'Unit 1: Force and Pressure',
    sequence: 1,
    plannedPeriods: 2,
    children: [
      { title: 'Force and its Effects', sequence: 1, plannedPeriods: 3 },
      { title: 'Pressure and Buoyancy', sequence: 2, plannedPeriods: 3 },
    ],
  },
  {
    title: 'Unit 2: Chemical Effects of Current',
    sequence: 2,
    plannedPeriods: 2,
    children: [
      { title: 'Conduction in Liquids', sequence: 1, plannedPeriods: 3 },
      { title: 'Electroplating', sequence: 2, plannedPeriods: 2 },
    ],
  },
];

const NOTICES = [
  {
    title: 'Staff meeting on Friday',
    message: 'All teaching staff please assemble in the auditorium at 3:30 PM for the monthly staff meeting.',
    category: 'general',
    audience: 'teachers',
    priority: 'medium',
  },
  {
    title: 'Mid-term exams schedule released',
    message: 'The mid-term examination timetable has been published. Please review your invigilation duties.',
    category: 'exam',
    audience: 'all',
    priority: 'high',
    pinned: true,
  },
  {
    title: 'Fee payment reminder — Q2 tuition',
    message: 'Parents are reminded that Q2 tuition fees are due by the end of this month. Late fees apply after the due date.',
    category: 'urgent',
    audience: 'parents',
    priority: 'high',
  },
  {
    title: 'Annual Sports Day registrations open',
    message: 'Students interested in track and field events should register with their class teacher by Friday.',
    category: 'event',
    audience: 'students',
    priority: 'medium',
  },
  {
    title: 'Library books due for return',
    message: 'All borrowed library books must be returned or renewed before the semester break.',
    category: 'general',
    audience: 'all',
    priority: 'low',
  },
  {
    title: 'PTA meeting — Grade 8',
    message: 'A parent-teacher meeting for Grade 8 sections will be held next Saturday from 10 AM to 1 PM.',
    category: 'general',
    audience: 'parents',
    priority: 'medium',
    pinned: true,
  },
];

const STUDENTS = [
  { admissionNo: 'ADM-1001', rollNo: '1', firstName: 'Aarav', lastName: 'Sharma', gender: 'male' },
  { admissionNo: 'ADM-1002', rollNo: '2', firstName: 'Diya', lastName: 'Verma', gender: 'female' },
  { admissionNo: 'ADM-1003', rollNo: '3', firstName: 'Kabir', lastName: 'Khan', gender: 'male' },
  { admissionNo: 'ADM-1004', rollNo: '4', firstName: 'Meera', lastName: 'Nair', gender: 'female' },
  { admissionNo: 'ADM-1005', rollNo: '5', firstName: 'Vihaan', lastName: 'Gupta', gender: 'male' },
  { admissionNo: 'ADM-1006', rollNo: '6', firstName: 'Ananya', lastName: 'Iyer', gender: 'female' },
  { admissionNo: 'ADM-1007', rollNo: '7', firstName: 'Reyansh', lastName: 'Patel', gender: 'male' },
  { admissionNo: 'ADM-1008', rollNo: '8', firstName: 'Ishita', lastName: 'Rao', gender: 'female' },
  { admissionNo: 'ADM-1009', rollNo: '9', firstName: 'Arjun', lastName: 'Mehta', gender: 'male' },
  { admissionNo: 'ADM-1010', rollNo: '10', firstName: 'Saanvi', lastName: 'Joshi', gender: 'female' },
  { admissionNo: 'ADM-1011', rollNo: '11', firstName: 'Aditya', lastName: 'Kulkarni', gender: 'male' },
  { admissionNo: 'ADM-1012', rollNo: '12', firstName: 'Anika', lastName: 'Menon', gender: 'female' },
  { admissionNo: 'ADM-1013', rollNo: '13', firstName: 'Vivaan', lastName: 'Chauhan', gender: 'male' },
  { admissionNo: 'ADM-1014', rollNo: '14', firstName: 'Kiara', lastName: 'Bose', gender: 'female' },
  { admissionNo: 'ADM-1015', rollNo: '15', firstName: 'Ayaan', lastName: 'Malhotra', gender: 'male' },
  { admissionNo: 'ADM-1016', rollNo: '16', firstName: 'Riya', lastName: 'Desai', gender: 'female' },
];

/** Extra directory-only students in the other seeded classes (6, 7, 9, 10)
 * so the Class filter on Student Management has real matches beyond 8-A.
 * Deliberately minimal — no attendance/homework/fee wiring — since they
 * exist purely to make the Class/Status filters exercise every option. */
const EXTRA_CLASS_STUDENTS = [
  { admissionNo: 'ADM-2001', rollNo: '1', firstName: 'Naveen', lastName: 'Reddy', gender: 'male', class: '6', section: 'A', status: 'active' },
  { admissionNo: 'ADM-2002', rollNo: '1', firstName: 'Pooja', lastName: 'Shetty', gender: 'female', class: '7', section: 'A', status: 'transferred' },
  { admissionNo: 'ADM-2003', rollNo: '1', firstName: 'Farhan', lastName: 'Ali', gender: 'male', class: '9', section: 'A', status: 'inactive' },
  { admissionNo: 'ADM-2004', rollNo: '1', firstName: 'Lakshmi', lastName: 'Pillai', gender: 'female', class: '10', section: 'A', status: 'suspended' },
];

/** Directory-only teachers (not wired into class 8-A's timetable) so
 * Teacher Management has more than one real row to browse. */
const EXTRA_TEACHERS = [
  {
    employeeId: 'EMP-0002', firstName: 'Neha', lastName: 'Kapoor', phone: '9999900010',
    email: 'neha.kapoor@demo.school', department: 'English', designation: 'TGT', employmentType: 'permanent',
  },
  {
    employeeId: 'EMP-0003', firstName: 'Rohan', lastName: 'Bhatt', phone: '9999900011',
    email: 'rohan.bhatt@demo.school', department: 'Science', designation: 'PGT', employmentType: 'permanent',
  },
  {
    employeeId: 'EMP-0004', firstName: 'Sunita', lastName: 'Pillai', phone: '9999900012',
    email: 'sunita.pillai@demo.school', department: 'Physical Education', designation: 'TGT', employmentType: 'contract',
  },
];

/** Directory-only classes (no curriculum wiring) so Class Management shows
 * a realistic spread across grades, not just 8-A. */
const EXTRA_CLASSES = [
  { name: '6', sections: ['A', 'B'] },
  { name: '7', sections: ['A'] },
  { name: '9', sections: ['A', 'B'] },
  { name: '10', sections: ['A'] },
];

/** Directory-only caretakers on their own routes, alongside CARE-0001 (R-7)
 * from upsertCaretaker below, so Caretaker Management has more than one row. */
const EXTRA_CARETAKERS = [
  {
    caretakerId: 'CARE-0002', firstName: 'Manoj', lastName: 'Yadav', phone: '9999900020',
    email: 'manoj.yadav@demo.school', vehicleNumber: 'MH-12-CD-7788', model: 'School Bus', route: 'R-3', capacity: 40,
  },
  {
    caretakerId: 'CARE-0003', firstName: 'Geeta', lastName: 'Rane', phone: '9999900021',
    email: 'geeta.rane@demo.school', vehicleNumber: 'MH-12-EF-9012', model: 'Tempo Traveller', route: 'R-9', capacity: 20,
  },
];

async function upsertUsers(User) {
  const byEmail = new Map();
  for (const u of USERS) {
    const existing = await User.findOne({ email: u.email }).setOptions({ withDeleted: true });
    if (existing) {
      logger.info(`Skip (exists): ${u.email}`);
      byEmail.set(u.email, existing);
      continue;
    }
    const created = await User.create({ ...u, password: DEFAULT_PASSWORD, status: 'active' });
    logger.info(`Created ${u.roles[0]}: ${u.email}`);
    byEmail.set(u.email, created);
  }
  return byEmail;
}

async function upsertTeacher(db, teacherUser) {
  const Teacher = db.model('Teacher');
  const teacher = await Teacher.findOneAndUpdate(
    { employeeId: 'EMP-0001' },
    {
      $set: {
        employeeId: 'EMP-0001',
        status: 'active',
        personal: {
          firstName: 'Tariq',
          lastName: 'Teacher',
          phone: '9999900000',
          email: teacherUser.email,
        },
        professional: {
          department: 'Mathematics',
          designation: 'PGT',
          employmentType: 'permanent',
        },
        userId: teacherUser._id,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  logger.info(`Teacher ready: ${teacher.employeeId} (linked to ${teacherUser.email})`);
  return teacher;
}

async function upsertClass(db, teacher) {
  const Class = db.model('Class');
  const klass = await Class.findOneAndUpdate(
    { name: '8', academicYear: ACADEMIC_YEAR },
    {
      $set: {
        name: '8',
        academicYear: ACADEMIC_YEAR,
        sections: ['A'],
        classTeacher: teacher._id,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  logger.info(`Class ready: ${klass.name}-A (${klass.academicYear})`);
  return klass;
}

/** More classes across grades (directory-only, no curriculum wiring) so Class
 * Management shows a realistic spread of grades, not just 8-A. */
async function upsertExtraClasses(db) {
  const Class = db.model('Class');
  let count = 0;
  for (const c of EXTRA_CLASSES) {
    await Class.findOneAndUpdate(
      { name: c.name, academicYear: ACADEMIC_YEAR },
      { $set: { name: c.name, academicYear: ACADEMIC_YEAR, sections: c.sections } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Extra classes ready: ${count} (grades ${EXTRA_CLASSES.map((c) => c.name).join(', ')}).`);
}

/** More teacher directory rows (not wired into any timetable) so Teacher
 * Management has a realistic-sized staff list to browse. */
async function upsertExtraTeachers(db) {
  const Teacher = db.model('Teacher');
  let count = 0;
  for (const t of EXTRA_TEACHERS) {
    await Teacher.findOneAndUpdate(
      { employeeId: t.employeeId },
      {
        $set: {
          employeeId: t.employeeId,
          status: 'active',
          personal: { firstName: t.firstName, lastName: t.lastName, phone: t.phone, email: t.email },
          professional: { department: t.department, designation: t.designation, employmentType: t.employmentType },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Extra teachers ready: ${count} (${EXTRA_TEACHERS.map((t) => t.employeeId).join(', ')}).`);
}

/** More caretaker directory rows on their own routes, alongside CARE-0001. */
async function upsertExtraCaretakers(db, { actorId }) {
  const Caretaker = db.model('Caretaker');
  let count = 0;
  for (const c of EXTRA_CARETAKERS) {
    await Caretaker.findOneAndUpdate(
      { caretakerId: c.caretakerId },
      {
        $set: {
          caretakerId: c.caretakerId,
          status: 'active',
          verificationStatus: 'verified',
          personal: { firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email, relationship: 'driver' },
          vehicleDetails: { vehicleNumber: c.vehicleNumber, model: c.model, driver: `${c.firstName} ${c.lastName}`, route: c.route, capacity: c.capacity, gpsStatus: 'unknown' },
          assignedStudents: [],
          loginEnabled: false,
          createdBy: actorId,
          updatedBy: actorId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Extra caretakers ready: ${count} (routes ${EXTRA_CARETAKERS.map((c) => c.route).join(', ')}).`);
}

// Real parent-contact data for the 3 students on the caretaker's route R-7
// (Aarav/Diya/Kabir — see upsertCaretaker) — not fabricated per request, the
// same seeded-once-like-every-other-demo-record discipline as everything
// else in this file. Aarav's block predates this and also carries his
// medical/transport data from earlier tasks.
const PARENT_CONTACTS = {
  'ADM-1001': {
    parent: {
      father: { name: 'Rajesh Sharma', phone: '9820011001', email: 'rajesh.sharma@example.com', occupation: 'Engineer' },
      mother: { name: 'Sunita Sharma', phone: '9820011002', email: 'sunita.sharma@example.com', occupation: 'Teacher' },
      primaryContact: 'father',
    },
    medical: { allergies: ['Peanuts'], conditions: [], medications: [], emergencyContact: '9820011001' },
    transport: { enrolled: true, routeNo: 'R-7', stopName: 'Lake View Colony', vehicleNo: 'MH-12-AB-3456' },
  },
  'ADM-1002': {
    parent: {
      father: { name: 'Anil Verma', phone: '9820011003', email: 'anil.verma@example.com', occupation: 'Shopkeeper' },
      mother: { name: 'Kavita Verma', phone: '9820011004', email: 'kavita.verma@example.com', occupation: 'Homemaker' },
      primaryContact: 'mother',
    },
  },
  'ADM-1003': {
    parent: {
      father: { name: 'Salim Khan', phone: '9820011005', email: 'salim.khan@example.com', occupation: 'Driver' },
      guardian: { name: 'Nasreen Khan', phone: '9820011006', relation: 'Aunt' },
      primaryContact: 'father',
    },
  },
};

async function upsertStudents(db) {
  const Student = db.model('Student');
  const created = [];

  // Same deterministic pattern used by upsertFeeTransactions, so a given
  // student's `feeStatus` snapshot here actually matches their real
  // FeeTransaction rows instead of two systems disagreeing.
  const FEE_STATUS_CYCLE = ['paid', 'paid', 'due', 'partial', 'overdue'];

  for (let i = 0; i < STUDENTS.length; i += 1) {
    const s = STUDENTS[i];
    const extra = PARENT_CONTACTS[s.admissionNo] || {};
    const tuitionAmount = 42000 + (i % 3) * 1500;
    const feeStatusValue = FEE_STATUS_CYCLE[i % FEE_STATUS_CYCLE.length];
    const paidAmount = feeStatusValue === 'paid' ? tuitionAmount : feeStatusValue === 'partial' ? Math.round(tuitionAmount * 0.4) : 0;

    // Two of the sixteen carry a non-active status so the Status filter has
    // real matches beyond "active" — harmless to the rest of their seeded
    // data (attendance/homework/fees are independent of this flag).
    const status = i === 14 ? 'inactive' : i === 15 ? 'suspended' : 'active';

    const doc = await Student.findOneAndUpdate(
      { admissionNo: s.admissionNo },
      {
        $set: {
          admissionNo: s.admissionNo,
          rollNo: s.rollNo,
          status,
          personal: { firstName: s.firstName, lastName: s.lastName, gender: s.gender },
          academic: { academicYear: ACADEMIC_YEAR, class: '8', section: 'A' },
          feeStatus: {
            totalFee: tuitionAmount,
            paidAmount,
            dueAmount: tuitionAmount - paidAmount,
            lastPaidDate: feeStatusValue === 'paid' ? new Date(Date.now() - ((i % 20) + 1) * DAY_MS) : null,
            status: feeStatusValue,
          },
          ...extra,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    created.push(doc);
  }
  logger.info(`Students ready: ${created.length} enrolled in class 8-A (gender, feeStatus and 2 non-active statuses set for filter coverage).`);
  return created;
}

/** Minimal directory-only students spread across the other seeded classes
 * (see EXTRA_CLASSES / upsertExtraClasses) purely so the Class filter on
 * Student Management has matches beyond "8" — otherwise selecting any
 * other class always returns an empty list regardless of what's chosen. */
async function upsertExtraClassStudents(db) {
  const Student = db.model('Student');
  let count = 0;
  for (const s of EXTRA_CLASS_STUDENTS) {
    await Student.findOneAndUpdate(
      { admissionNo: s.admissionNo },
      {
        $set: {
          admissionNo: s.admissionNo,
          rollNo: s.rollNo,
          status: s.status,
          personal: { firstName: s.firstName, lastName: s.lastName, gender: s.gender },
          academic: { academicYear: ACADEMIC_YEAR, class: s.class, section: s.section },
          feeStatus: { totalFee: 40000, paidAmount: 0, dueAmount: 40000, status: 'due' },
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Extra class students ready: ${count} (classes ${EXTRA_CLASS_STUDENTS.map(s => s.class).join(', ')} — statuses: ${EXTRA_CLASS_STUDENTS.map(s => s.status).join('/')}).`);
}

async function upsertNotices(db, actorId) {
  const Notice = db.model('Notice');
  let count = 0;
  for (const n of NOTICES) {
    const exists = await Notice.findOne({ title: n.title });
    if (exists) continue;
    await Notice.create({ ...n, createdBy: actorId, status: 'published' });
    count += 1;
  }
  logger.info(`Notices ready: ${count} created (or already present).`);
}

const DAY_MS = 24 * 60 * 60 * 1000;

async function upsertHomework(db, { klass, teacher, teacherUser, subjects, students }) {
  const Homework = db.model('Homework');
  const Submission = db.model('Submission');
  const now = Date.now();

  const items = [
    {
      title: 'Chapter 1 Exercise 1.2',
      description: 'Solve all questions from Exercise 1.2 on rational numbers.',
      subject: subjects.get('MATH8'),
      dueDate: new Date(now + 5 * DAY_MS),
      maxMarks: 10,
      submissionType: 'physical',
      status: 'assigned',
    },
    {
      title: 'Algebra Worksheet',
      description: 'Complete the linear equations worksheet handed out in class.',
      subject: subjects.get('MATH8'),
      dueDate: new Date(now - 3 * DAY_MS),
      maxMarks: 10,
      submissionType: 'physical',
      status: 'assigned',
    },
    {
      title: 'Unit Test Prep (draft)',
      description: 'Revision sheet for the upcoming unit test — not yet assigned.',
      subject: subjects.get('MATH8'),
      dueDate: new Date(now + 10 * DAY_MS),
      maxMarks: 20,
      submissionType: 'physical',
      status: 'draft',
    },
    {
      title: 'Science Observation Journal',
      description: 'Record daily observations of the bean sprout experiment for one week.',
      subject: subjects.get('SCI8'),
      dueDate: new Date(now - 6 * DAY_MS),
      maxMarks: 10,
      submissionType: 'physical',
      status: 'assigned',
    },
    {
      title: 'English Essay Draft',
      description: 'Submit a first draft of the descriptive essay assigned in class.',
      subject: subjects.get('ENG8'),
      dueDate: new Date(now + 2 * DAY_MS),
      maxMarks: 15,
      submissionType: 'online',
      status: 'assigned',
    },
  ];

  const created = [];
  for (const item of items) {
    const hw = await Homework.findOneAndUpdate(
      { teacher: teacher._id, class: klass._id, section: 'A', title: item.title },
      {
        $set: {
          ...item,
          teacher: teacher._id,
          class: klass._id,
          section: 'A',
          academicYear: ACADEMIC_YEAR,
          subject: item.subject._id,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    created.push(hw);
  }
  logger.info(`Homework ready: ${created.length} assignments for class 8-A.`);

  // Grade one student on the past-due assignment, to give the demo real graded state.
  const pastDue = created.find((h) => h.title === 'Algebra Worksheet');
  const firstStudent = students[0]; // Aarav Sharma — the student with both a parent and student portal account.
  if (pastDue && firstStudent) {
    await Submission.findOneAndUpdate(
      { homework: pastDue._id, student: firstStudent._id },
      {
        $set: {
          status: 'graded',
          marks: 8,
          feedback: 'Good work, minor errors in question 4.',
          gradedBy: teacherUser._id,
          gradedAt: new Date(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    logger.info('Submission ready: one graded submission on "Algebra Worksheet".');
  }

  // Submitted but not yet graded — so the student portal's Diary/Homework
  // page has a real example of every status (pending, submitted, graded,
  // overdue) rather than just pending + graded. "Science Observation
  // Journal" is deliberately left with no submission at all — overdue.
  const essayDraft = created.find((h) => h.title === 'English Essay Draft');
  if (essayDraft && firstStudent) {
    await Submission.findOneAndUpdate(
      { homework: essayDraft._id, student: firstStudent._id },
      { $set: { status: 'submitted', submittedAt: new Date(), text: 'Draft attached — see essay-draft.docx' } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    logger.info('Submission ready: one submitted (ungraded) submission on "English Essay Draft".');
  }
}

/**
 * Every school weekday of the current month up to yesterday, so the Reports
 * page (teacher side) and the student portal's Attendance page (student
 * side) both have a real, multi-week register to cross-check against.
 * Aarav (students[0] — the student with both a parent and student portal
 * account) gets one absence and one late day for realistic, non-uniform
 * texture; every other student is present throughout. Dates are normalized
 * to midnight UTC, matching `AttendanceService.normalizeDate` — the same
 * convention the teacher's markAttendance endpoint writes with, so range
 * queries ($gte/$lte on a boundary day) behave identically for seeded and
 * teacher-marked rows.
 */
async function upsertAttendance(db, { klass, students, teacherUser }) {
  const Attendance = db.model('Attendance');
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));

  if (startOfMonth > yesterday) {
    logger.info('Attendance ready: 0 record(s) — first day of the month, nothing to backfill yet.');
    return;
  }

  // Clear this range first: earlier seed runs (before dates were normalized
  // to midnight UTC here) wrote timestamps with real time-of-day, which the
  // unique index treats as distinct from today's midnight-normalized rows —
  // silently accumulating duplicate rows per calendar day on repeat runs
  // instead of upserting in place. A clean delete + recreate for just this
  // class/section/range keeps the seed idempotent no matter when it last ran.
  const rangeEnd = new Date(yesterday.getTime() + DAY_MS); // exclusive upper bound
  await Attendance.deleteMany({ class: klass._id, section: 'A', date: { $gte: startOfMonth, $lt: rangeEnd } });

  let count = 0;
  let weekdayIndex = 0;
  for (let d = startOfMonth; d <= yesterday; d = new Date(d.getTime() + DAY_MS)) {
    const dow = d.getUTCDay(); // 0 = Sunday, 6 = Saturday
    if (dow === 0 || dow === 6) continue;
    weekdayIndex += 1;

    for (let i = 0; i < students.length; i += 1) {
      let status = 'present';
      if (i === 0 && weekdayIndex === 3) status = 'absent';
      if (i === 0 && weekdayIndex === 6) status = 'late';

      await Attendance.create({
        academicYear: ACADEMIC_YEAR, class: klass._id, section: 'A', student: students[i]._id,
        date: d, period: null, status, markedBy: teacherUser._id,
      });
      count += 1;
    }
  }
  logger.info(`Attendance ready: ${count} record(s) across ${weekdayIndex} weekday(s) this month for class 8-A.`);
}

async function upsertSubjects(db) {
  const Subject = db.model('Subject');
  const bySlug = new Map();
  for (const s of SUBJECTS) {
    const subject = await Subject.findOneAndUpdate(
      { code: s.code },
      { $set: s },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    logger.info(`Subject ready: ${subject.code}`);
    bySlug.set(subject.code, subject);
  }
  return bySlug;
}

async function upsertMathSyllabus(db, mathSubject) {
  const Topic = db.model('SyllabusTopic');
  const created = [];
  for (const unit of MATH_SYLLABUS) {
    const unitDoc = await Topic.findOneAndUpdate(
      { subject: mathSubject._id, grade: '8', academicYear: ACADEMIC_YEAR, title: unit.title, parent: null },
      { $set: { sequence: unit.sequence, plannedPeriods: unit.plannedPeriods } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    created.push(unitDoc);
    for (const child of unit.children) {
      const childDoc = await Topic.findOneAndUpdate(
        { subject: mathSubject._id, grade: '8', academicYear: ACADEMIC_YEAR, title: child.title, parent: unitDoc._id },
        { $set: { sequence: child.sequence, plannedPeriods: child.plannedPeriods } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      created.push(childDoc);
    }
  }
  logger.info(`Syllabus tree ready for Mathematics grade 8 (${created.length} topics).`);
  return created;
}

async function upsertScienceSyllabus(db, scienceSubject) {
  const Topic = db.model('SyllabusTopic');
  const created = [];
  for (const unit of SCIENCE_SYLLABUS) {
    const unitDoc = await Topic.findOneAndUpdate(
      { subject: scienceSubject._id, grade: '8', academicYear: ACADEMIC_YEAR, title: unit.title, parent: null },
      { $set: { sequence: unit.sequence, plannedPeriods: unit.plannedPeriods } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    created.push(unitDoc);
    for (const child of unit.children) {
      const childDoc = await Topic.findOneAndUpdate(
        { subject: scienceSubject._id, grade: '8', academicYear: ACADEMIC_YEAR, title: child.title, parent: unitDoc._id },
        { $set: { sequence: child.sequence, plannedPeriods: child.plannedPeriods } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      created.push(childDoc);
    }
  }
  logger.info(`Syllabus tree ready for Science grade 8 (${created.length} topics).`);
  return created;
}

async function upsertTimetable(db, { klass, teacher, subjects }) {
  const TimetableEntry = db.model('TimetableEntry');
  const slots = [
    { dayOfWeek: 1, period: 1, subject: subjects.get('MATH8'), room: 'R-101' },
    { dayOfWeek: 1, period: 3, subject: subjects.get('SCI8'), room: 'R-102' },
    { dayOfWeek: 2, period: 2, subject: subjects.get('ENG8'), room: 'R-103' },
    { dayOfWeek: 3, period: 2, subject: subjects.get('MATH8'), room: 'R-101' },
    { dayOfWeek: 4, period: 1, subject: subjects.get('SCI8'), room: 'R-102' },
    { dayOfWeek: 5, period: 4, subject: subjects.get('ENG8'), room: 'R-103' },
    { dayOfWeek: 6, period: 1, subject: subjects.get('MATH8'), room: 'R-101' },
  ];
  let count = 0;
  for (const slot of slots) {
    await TimetableEntry.findOneAndUpdate(
      {
        academicYear: ACADEMIC_YEAR,
        class: klass._id,
        section: 'A',
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
      },
      {
        $set: {
          academicYear: ACADEMIC_YEAR,
          class: klass._id,
          section: 'A',
          subject: slot.subject._id,
          staff: teacher._id,
          dayOfWeek: slot.dayOfWeek,
          period: slot.period,
          room: slot.room,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Timetable ready: ${count} slot(s) for class 8-A / ${teacher.employeeId}.`);
}

async function upsertSyllabusProgress(db, { klass, topics, teacherUser }) {
  const Progress = db.model('SyllabusProgress');
  const firstChapter = topics.find((t) => t.title === 'Rational Numbers');
  const secondChapter = topics.find((t) => t.title === 'Squares and Square Roots');

  if (firstChapter) {
    await Progress.findOneAndUpdate(
      { class: klass._id, section: 'A', topic: firstChapter._id },
      { $set: { academicYear: ACADEMIC_YEAR, status: 'in_progress', markedBy: teacherUser._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  if (secondChapter) {
    await Progress.findOneAndUpdate(
      { class: klass._id, section: 'A', topic: secondChapter._id },
      { $set: { academicYear: ACADEMIC_YEAR, status: 'completed', completedOn: new Date(), markedBy: teacherUser._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  logger.info('Syllabus progress ready: "Rational Numbers" in_progress, "Squares and Square Roots" completed, for class 8-A.');
}

async function upsertStudyMaterials(db, { klass, teacher, subjects, mathTopics }) {
  const Material = db.model('StudyMaterial');
  const rationalNumbers = mathTopics.find((t) => t.title === 'Rational Numbers');

  const items = [
    {
      title: 'Rational Numbers — quick notes',
      type: 'notes',
      subject: subjects.get('MATH8')._id,
      topic: rationalNumbers?._id || null,
      description: 'Summary of rational number properties and worked examples from class.',
      visibility: 'class',
    },
    {
      title: 'Algebra practice worksheet',
      type: 'worksheet',
      subject: subjects.get('MATH8')._id,
      topic: null,
      url: 'https://example.com/materials/algebra-worksheet.pdf',
      visibility: 'class',
    },
    {
      title: 'States of Matter — explainer video',
      type: 'video',
      subject: subjects.get('SCI8')._id,
      topic: null,
      url: 'https://example.com/materials/states-of-matter.mp4',
      visibility: 'school',
    },
  ];

  let count = 0;
  for (const item of items) {
    await Material.findOneAndUpdate(
      { teacher: teacher._id, class: klass._id, section: 'A', title: item.title },
      { $set: { ...item, teacher: teacher._id, class: klass._id, section: 'A', academicYear: ACADEMIC_YEAR } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Study material ready: ${count} item(s) for class 8-A.`);
}

async function upsertDocuments(db, { teacher, teacherUser, principalUser }) {
  const Document = db.model('Document');
  const now = Date.now();

  const teacherOwned = [
    {
      ownerType: 'teacher', owner: teacher._id, category: 'personal', title: 'Aadhaar Card',
      url: 'https://example.com/documents/aadhaar-card.pdf',
    },
    {
      ownerType: 'teacher', owner: teacher._id, category: 'certificate', title: 'B.Ed Certificate',
      url: 'https://example.com/documents/bed-certificate.pdf',
      expiryDate: new Date(now + 15 * DAY_MS), // deliberately near-term, so the "expiring soon" badge has something real to show.
    },
  ];
  const schoolIssued = [
    {
      ownerType: 'school', category: 'policy', title: 'Code of Conduct Policy',
      description: 'Staff code of conduct — expectations for classroom behavior, attendance, and communication.',
    },
    {
      ownerType: 'school', category: 'circular', title: "Founder's Day Circular",
      description: "School will observe Founder's Day next month — details on the assembly schedule.",
    },
  ];

  let count = 0;
  for (const item of teacherOwned) {
    await Document.findOneAndUpdate(
      { ownerType: 'teacher', owner: teacher._id, title: item.title },
      { $set: { ...item, uploadedBy: teacherUser._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  for (const item of schoolIssued) {
    await Document.findOneAndUpdate(
      { ownerType: 'school', title: item.title },
      { $set: { ...item, uploadedBy: principalUser._id } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Documents ready: ${count} item(s) (2 teacher-owned, 2 school-issued).`);
}

/**
 * One student gets BOTH a parent account and a student account — the two
 * viewer types the student portal distinguishes (fees visible to the parent,
 * hidden from the student). `.create()` (not findOneAndUpdate) so the
 * password pre-save hook actually hashes it.
 */
async function upsertStudentAccounts(db, { students }) {
  const StudentAccount = db.model('StudentAccount');
  const target = students.find((s) => s.admissionNo === 'ADM-1001');
  if (!target) return;

  const accounts = [
    { email: 'aarav.parent@demo.school', viewerType: 'parent' },
    { email: 'aarav.student@demo.school', viewerType: 'student' },
  ];

  let count = 0;
  for (const acc of accounts) {
    const existing = await StudentAccount.findOne({ email: acc.email });
    if (existing) {
      logger.info(`Skip (exists): ${acc.email}`);
      count += 1;
      continue;
    }
    await StudentAccount.create({
      student: target._id, viewerType: acc.viewerType, email: acc.email, password: DEFAULT_PASSWORD, isActive: true,
    });
    logger.info(`Created student-portal ${acc.viewerType} account: ${acc.email}`);
    count += 1;
  }
  logger.info(`Student accounts ready: ${count} (parent + student, both for ${target.personal.firstName} ${target.personal.lastName}).`);
}

/**
 * Real FeeTransaction rows across every seeded student — not just Aarav —
 * so the Finance directory and the dashboard's fee-collection chart have a
 * realistic spread of paid/pending/partial/overdue amounts instead of one
 * student's numbers. Deterministic per-student pattern (not random) so
 * re-seeding is idempotent and the numbers are stable across runs.
 */
async function upsertFeeTransactions(db, { students, actorId }) {
  const FeeTransaction = db.model('FeeTransaction');
  const now = Date.now();

  const STATUS_CYCLE = ['paid', 'paid', 'pending', 'partial', 'overdue'];
  let count = 0;

  for (let i = 0; i < students.length; i += 1) {
    const student = students[i];
    const status = STATUS_CYCLE[i % STATUS_CYCLE.length];
    const tuitionAmount = 42000 + (i % 3) * 1500;

    const tuition = { feeType: 'tuition', amount: tuitionAmount, status };
    if (status === 'paid') {
      tuition.paymentMode = ['online', 'cash', 'card', 'upi'][i % 4];
      tuition.transactionRef = `RCPT-2026-${String(1000 + i).padStart(4, '0')}`;
      tuition.paidDate = new Date(now - ((i % 20) + 1) * DAY_MS);
    } else if (status === 'overdue') {
      tuition.dueDate = new Date(now - ((i % 15) + 5) * DAY_MS);
    } else {
      tuition.dueDate = new Date(now + ((i % 10) + 3) * DAY_MS);
    }

    await FeeTransaction.findOneAndUpdate(
      { student: student._id, feeType: 'tuition', academicYear: ACADEMIC_YEAR },
      { $set: { ...tuition, student: student._id, academicYear: ACADEMIC_YEAR, createdBy: actorId, updatedBy: actorId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;

    // Every third student also has a transport fee row, for feeType variety.
    if (i % 3 === 0) {
      const transportStatus = i % 6 === 0 ? 'overdue' : 'paid';
      const transport = { feeType: 'transport', amount: 8000, status: transportStatus };
      if (transportStatus === 'paid') {
        transport.paymentMode = 'cash';
        transport.transactionRef = `RCPT-2026-T${String(1000 + i).padStart(4, '0')}`;
        transport.paidDate = new Date(now - ((i % 12) + 2) * DAY_MS);
      } else {
        transport.dueDate = new Date(now - ((i % 8) + 3) * DAY_MS);
      }
      await FeeTransaction.findOneAndUpdate(
        { student: student._id, feeType: 'transport', academicYear: ACADEMIC_YEAR },
        { $set: { ...transport, student: student._id, academicYear: ACADEMIC_YEAR, createdBy: actorId, updatedBy: actorId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      count += 1;
    }
  }

  // Aarav additionally keeps his exam-fee row (partial) — a fee type not
  // otherwise represented, so the finance breakdown has 3 distinct types.
  const aarav = students.find((s) => s.admissionNo === 'ADM-1001');
  if (aarav) {
    await FeeTransaction.findOneAndUpdate(
      { student: aarav._id, feeType: 'exam', academicYear: ACADEMIC_YEAR },
      {
        $set: {
          feeType: 'exam', amount: 3000, status: 'partial', dueDate: new Date(now + 12 * DAY_MS),
          student: aarav._id, academicYear: ACADEMIC_YEAR, createdBy: actorId, updatedBy: actorId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }

  // A second student rounds out every remaining feeType/status enum value
  // (hostel, library, refunded) so the Finance filters have zero dead ends.
  const diya = students.find((s) => s.admissionNo === 'ADM-1002');
  if (diya) {
    const extras = [
      { feeType: 'hostel', amount: 60000, status: 'paid', paymentMode: 'online', transactionRef: 'RCPT-2026-H0002', paidDate: new Date(now - 18 * DAY_MS) },
      { feeType: 'library', amount: 1500, status: 'refunded', paymentMode: 'cash', transactionRef: 'RCPT-2026-L0002', paidDate: new Date(now - 30 * DAY_MS) },
    ];
    for (const extra of extras) {
      await FeeTransaction.findOneAndUpdate(
        { student: diya._id, feeType: extra.feeType, academicYear: ACADEMIC_YEAR },
        { $set: { ...extra, student: diya._id, academicYear: ACADEMIC_YEAR, createdBy: actorId, updatedBy: actorId } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      count += 1;
    }
  }

  logger.info(`Fee transactions ready: ${count} row(s) across ${students.length} student(s) — every feeType and status enum represented.`);
}

/**
 * One exam ("Term 1 Mid-Term") for class 8-A with 3 scheduled subjects
 * (Mathematics, Science, English) — real data for the exam-scheduling
 * module's principal/teacher screens, and for the upcoming student exam view
 * to read. Left `scheduled` (not `results_published`) and with NO ExamMark
 * rows — marks are entered live via the teacher's Marks Entry screen, not
 * fabricated here. Keyed by (title, academicYear) / (exam, class, section,
 * subject) so re-seeding upserts in place rather than duplicating.
 */
async function upsertExamScheduling(db, { klass, subjects, actorId }) {
  const Exam = db.model('Exam');
  const ExamSchedule = db.model('ExamSchedule');
  const now = Date.now();

  const exam = await Exam.findOneAndUpdate(
    { title: 'Term 1 Mid-Term', academicYear: ACADEMIC_YEAR },
    {
      $set: {
        title: 'Term 1 Mid-Term',
        academicYear: ACADEMIC_YEAR,
        type: 'midterm',
        classes: [klass._id],
        startDate: new Date(now + 20 * DAY_MS),
        endDate: new Date(now + 25 * DAY_MS),
        status: 'scheduled',
        createdBy: actorId,
        updatedBy: actorId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const sittings = [
    { subject: subjects.get('MATH8'), date: new Date(now + 20 * DAY_MS), startTime: '09:00', endTime: '11:00', room: 'R-101', maxMarks: 100 },
    { subject: subjects.get('SCI8'), date: new Date(now + 22 * DAY_MS), startTime: '09:00', endTime: '11:00', room: 'R-102', maxMarks: 100 },
    { subject: subjects.get('ENG8'), date: new Date(now + 24 * DAY_MS), startTime: '09:00', endTime: '11:00', room: 'R-103', maxMarks: 100 },
  ];

  let count = 0;
  for (const sitting of sittings) {
    await ExamSchedule.findOneAndUpdate(
      { exam: exam._id, class: klass._id, section: 'A', subject: sitting.subject._id },
      {
        $set: {
          exam: exam._id, class: klass._id, section: 'A', subject: sitting.subject._id,
          date: sitting.date, startTime: sitting.startTime, endTime: sitting.endTime,
          room: sitting.room, maxMarks: sitting.maxMarks,
          createdBy: actorId, updatedBy: actorId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Exam ready: "${exam.title}" with ${count} scheduled subject(s) for class 8-A (no marks entered yet — enter live via Marks Entry).`);
}

/**
 * The Exam Management pages (ExamDirectory/AddExam/ExamDetail) read from the
 * `Examination` model — a completely different model from the `Exam`/
 * `ExamSchedule` pair seeded by `upsertExamScheduling` above (that pair backs
 * an unrelated, unused-by-this-frontend module). Without this function the
 * Examination collection was never touched by seeding at all, so the Exam
 * Management page had zero real data and its type/status filters had
 * nothing to match against. Spans every `type` and `status` enum value so
 * every filter option returns something.
 */
async function upsertExaminations(db, { students, actorId }) {
  const Examination = db.model('Examination');
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
      // marks + results are generated below for every seeded student.
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
      { $set: { ...e, createdBy: actorId, updatedBy: actorId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    examDocsById.set(e.examId, doc);
    count += 1;
  }

  // Real marks + published results for the completed Unit Test, across
  // every seeded student — makes the "completed" filter and a result view
  // show genuine numbers instead of an empty table.
  const unitTest = examDocsById.get('EXAM-2024-UNITTEST1');
  if (unitTest && students.length) {
    const marks = students.map((s, i) => {
      const obtained = 28 + ((i * 7) % 20); // deterministic spread, 28-47 out of 50
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
  }

  logger.info(`Examinations ready: ${count} (types: mid_term/unit_test/annual/mock/internal/competitive — every status from draft to cancelled represented; marks+results published for the completed unit test).`);
}

async function upsertEvents(db, { actorId, teacherUser }) {
  const Event = db.model('Event');
  const now = Date.now();

  // Must exactly match the frontend's hardcoded CATEGORIES filter list
  // (EventDirectory.jsx) — event.category has no schema enum, so a mismatch
  // here silently breaks the category filter (dropdown offers values that
  // never match any seeded row).
  const EVENTS = [
    {
      eventId: 'EVT-2024-SPORTS', name: 'Annual Sports Day', category: 'Sports', status: 'approved',
      description: 'Inter-house athletics, relay races, and team sports for all classes.',
      schedule: {
        startDate: new Date(now + 15 * DAY_MS), endDate: new Date(now + 15 * DAY_MS),
        agenda: [
          { session: 'Opening March Past', time: '08:30', speaker: 'Head Boy & Head Girl', description: 'All classes assemble on the main ground.' },
          { session: 'Track Events', time: '09:30', speaker: null, description: '100m, 200m, and relay races by age group.' },
          { session: 'Prize Distribution', time: '15:30', speaker: 'Principal', description: 'Closing ceremony and medals.' },
        ],
      },
      venue: { hall: 'Main Ground', address: 'School Campus', seatingCapacity: 800, facilities: ['Seating', 'PA System', 'First Aid'] },
      committees: [
        { role: 'coordinator', name: 'Tariq Teacher', userId: teacherUser?._id || null, responsibility: 'Overall event coordination and schedule management.' },
        { role: 'staff', name: 'Sunita Pillai', responsibility: 'Track events supervision and equipment.' },
        { role: 'volunteer', name: 'Rohan Bhatt', responsibility: 'First-aid station and student safety.' },
      ],
      photos: [
        { url: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800', caption: 'Sports day track events, 2023 edition' },
        { url: 'https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800', caption: 'Prize distribution ceremony' },
      ],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 10 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 8 * DAY_MS), notes: 'Approved — budget confirmed with administration.' },
    },
    {
      eventId: 'EVT-2024-FOUNDERS', name: "Founders' Day Celebration", category: 'Cultural', status: 'completed',
      description: 'Cultural performances and a felicitation ceremony marking the school\'s founding.',
      schedule: { startDate: new Date(now - 45 * DAY_MS), endDate: new Date(now - 45 * DAY_MS) },
      venue: { hall: 'Auditorium', seatingCapacity: 600 },
      committees: [
        { role: 'coordinator', name: 'Neha Kapoor', responsibility: 'Cultural program direction and student rehearsals.' },
      ],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 55 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 53 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-SCIFAIR', name: 'Inter-School Science Fair', category: 'Science Fair', status: 'draft',
      description: 'Proposed exhibition of student science projects — not yet approved.',
      schedule: { startDate: new Date(now + 40 * DAY_MS), endDate: new Date(now + 41 * DAY_MS) },
      venue: { hall: 'Science Block' },
      committees: [
        { role: 'coordinator', name: 'Rohan Bhatt', responsibility: 'Draft proposal — science department lead.' },
      ],
    },
    {
      eventId: 'EVT-2024-TRIP', name: 'Class 8 Excursion', category: 'Field Trip', status: 'pending_approval',
      description: 'Day trip proposal, awaiting administrative approval.',
      schedule: { startDate: new Date(now + 20 * DAY_MS), endDate: new Date(now + 20 * DAY_MS) },
      venue: { address: 'City Science Museum' },
      committees: [
        { role: 'coordinator', name: 'Tariq Teacher', userId: teacherUser?._id || null, responsibility: 'Chaperone lead and transport coordination.' },
        { role: 'staff', name: 'Manoj Yadav', responsibility: 'Bus driver for the excursion route.' },
      ],
      approval: { requestedBy: teacherUser?._id || actorId, requestedAt: new Date(now - 2 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-PARENTMEET', name: 'Parent-Teacher Meeting — Term 1', category: 'Academic', status: 'approved',
      description: 'Term 1 progress discussion for all grades, section-wise slots.',
      schedule: { startDate: new Date(now + 8 * DAY_MS), endDate: new Date(now + 8 * DAY_MS) },
      venue: { hall: 'Classrooms', seatingCapacity: 30 },
      approval: { requestedBy: actorId, requestedAt: new Date(now - 5 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 4 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-INDEPENDENCE', name: 'Independence Day Celebration', category: 'Cultural', status: 'completed',
      description: 'Flag hoisting, patriotic performances, and a special assembly.',
      schedule: { startDate: new Date(now - 20 * DAY_MS), endDate: new Date(now - 20 * DAY_MS) },
      venue: { hall: 'Main Ground', seatingCapacity: 800 },
      photos: [
        { url: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=800', caption: 'Flag hoisting ceremony' },
      ],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 25 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 23 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-QUIZ', name: 'Inter-House Quiz Competition', category: 'Competition', status: 'approved',
      description: 'General knowledge quiz between the four school houses.',
      schedule: { startDate: new Date(now + 30 * DAY_MS), endDate: new Date(now + 30 * DAY_MS) },
      venue: { hall: 'Auditorium', seatingCapacity: 400 },
      committees: [
        { role: 'coordinator', name: 'Sunita Pillai', responsibility: 'Question bank preparation and house coordination.' },
      ],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 6 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 5 * DAY_MS) },
    },
  ];

  let count = 0;
  for (const e of EVENTS) {
    await Event.findOneAndUpdate(
      { eventId: e.eventId },
      {
        $set: {
          ...e,
          academicYear: ACADEMIC_YEAR,
          organizer: { name: 'Priya Principal', department: 'Administration', userId: actorId },
          createdBy: actorId,
          updatedBy: actorId,
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Events ready: ${count} (2 public — approved/completed — plus 1 draft and 1 pending_approval to prove the student feed excludes them).`);
}

/**
 * Links the seeded caretaker (caretaker@demo.school) to a real Caretaker
 * directory record for route "R-7" — the SAME route string already on
 * Aarav's `Student.transport.routeNo` (set by the Transport-page task), so
 * the caretaker portal and the student Transport page agree on one route,
 * ready for a future task to join them. Three students (Aarav + two
 * classmates) are put on the roster and their own `Student.transport` is
 * kept in sync, matching the pickup/drop stops the caretaker will see.
 * `Caretaker` has no schema of its own to add — this reuses the existing
 * principal-side directory model exactly as the class-teacher module reuses
 * `Class`/`Student`.
 */
async function upsertCaretaker(db, { students, actorId }) {
  const Caretaker = db.model('Caretaker');
  const User = db.model('User');

  const caretakerUser = await User.findOne({ email: 'caretaker@demo.school' });
  if (!caretakerUser) {
    logger.warn('Caretaker user not found — skipping caretaker/route seed.');
    return;
  }

  const byAdmissionNo = new Map(students.map((s) => [s.admissionNo, s]));
  const roster = [
    { admissionNo: 'ADM-1001', pickupPoint: 'Lake View Colony', dropPoint: 'Lake View Colony' },
    { admissionNo: 'ADM-1002', pickupPoint: 'Green Park', dropPoint: 'Green Park' },
    { admissionNo: 'ADM-1003', pickupPoint: 'Green Park', dropPoint: 'Green Park' },
  ]
    .map(({ admissionNo, pickupPoint, dropPoint }) => {
      const s = byAdmissionNo.get(admissionNo);
      if (!s) return null;
      return {
        studentId: s._id, admissionNo: s.admissionNo,
        name: `${s.personal.firstName} ${s.personal.lastName}`,
        class: s.academic.class, section: s.academic.section, rollNo: s.rollNo,
        pickupPoint, dropPoint, route: 'R-7',
      };
    })
    .filter(Boolean);

  const caretaker = await Caretaker.findOneAndUpdate(
    { caretakerId: 'CARE-0001' },
    {
      $set: {
        caretakerId: 'CARE-0001',
        status: 'active',
        verificationStatus: 'verified',
        personal: { firstName: 'Carla', lastName: 'Caretaker', phone: '9999900002', email: caretakerUser.email, relationship: 'driver' },
        vehicleDetails: { vehicleNumber: 'MH-12-AB-3456', model: 'Tempo Traveller', driver: 'Carla Caretaker', route: 'R-7', capacity: 20, gpsStatus: 'unknown' },
        assignedStudents: roster,
        loginEnabled: true,
        userId: caretakerUser._id,
        createdBy: actorId,
        updatedBy: actorId,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // Keep Student.transport in sync for the two classmates who weren't
  // already enrolled (Aarav's was set by the earlier Transport-page seed).
  const Student = db.model('Student');
  for (const entry of roster) {
    if (entry.admissionNo === 'ADM-1001') continue;
    await Student.updateOne(
      { _id: entry.studentId },
      { $set: { transport: { enrolled: true, routeNo: 'R-7', stopName: entry.pickupPoint, vehicleNo: 'MH-12-AB-3456' } } }
    );
  }

  logger.info(`Caretaker ready: ${caretaker.caretakerId} (linked to ${caretakerUser.email}) on route R-7 with ${roster.length} student(s).`);
}

/**
 * A realistic mixed set of leave requests — pending, approved, and rejected
 * — across the class teacher and one caretaker, so Leave Management has
 * more than an empty list to show and exercises every status filter.
 */
async function upsertLeaveRequests(db, { teacher, actorId }) {
  const LeaveRequest = db.model('LeaveRequest');
  const Caretaker = db.model('Caretaker');
  const now = Date.now();

  const caretaker = await Caretaker.findOne({ caretakerId: 'CARE-0001' });

  const requests = [
    {
      applicantType: 'teacher', applicant: teacher._id, applicantModel: 'Teacher',
      leaveType: 'sick', fromDate: new Date(now + 3 * DAY_MS), toDate: new Date(now + 4 * DAY_MS),
      totalDays: 2, reason: 'Fever and viral infection, advised rest by doctor.', status: 'pending',
    },
    {
      applicantType: 'teacher', applicant: teacher._id, applicantModel: 'Teacher',
      leaveType: 'casual', fromDate: new Date(now - 20 * DAY_MS), toDate: new Date(now - 19 * DAY_MS),
      totalDays: 2, reason: 'Family function out of town.', status: 'approved',
      decidedBy: actorId, decidedAt: new Date(now - 22 * DAY_MS), approverRemarks: 'Approved — please arrange for a substitute.',
    },
    {
      applicantType: 'teacher', applicant: teacher._id, applicantModel: 'Teacher',
      leaveType: 'earned', fromDate: new Date(now - 60 * DAY_MS), toDate: new Date(now - 55 * DAY_MS),
      totalDays: 6, reason: 'Planned vacation.', status: 'rejected',
      decidedBy: actorId, decidedAt: new Date(now - 62 * DAY_MS), approverRemarks: 'Clashes with mid-term prep — please reschedule.',
    },
  ];

  if (caretaker) {
    requests.push({
      applicantType: 'caretaker', applicant: caretaker._id, applicantModel: 'Caretaker',
      leaveType: 'casual', fromDate: new Date(now + 1 * DAY_MS), toDate: new Date(now + 1 * DAY_MS),
      totalDays: 1, reason: 'Personal work.', status: 'pending',
    });
  }

  let count = 0;
  for (const r of requests) {
    await LeaveRequest.findOneAndUpdate(
      { applicant: r.applicant, fromDate: r.fromDate, leaveType: r.leaveType },
      { $set: r },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
  }
  logger.info(`Leave requests ready: ${count} (mixed pending/approved/rejected).`);
}

/**
 * Runs one seed step in isolation: logs which step is starting, and if it
 * throws, logs the full error and CONTINUES to the next step instead of
 * aborting the entire script. Without this, a single failing step (e.g. a
 * schema mismatch in one function) silently prevents every step after it
 * from ever running — which is indistinguishable from "the data is just
 * missing" unless you're staring at the raw stack trace. Wrapping every
 * step means one bad step degrades gracefully instead of taking the whole
 * seed run down with it, and any real error is now impossible to miss.
 */
async function step(label, fn) {
  try {
    await fn();
  } catch (err) {
    logger.error(`✘ SEED STEP FAILED: ${label}`);
    logger.error(err.stack || err.message || err);
  }
}

async function seed() {
  await connectionManager.connect();

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOneAndUpdate(
    { slug: SCHOOL.slug },
    { $set: SCHOOL },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  logger.info(`Tenant ready: ${tenant.slug} -> ${tenant.dbName}`);

  const db = await connectionManager.getTenantConnection(tenant);
  const User = db.model('User');

  const usersByEmail = await upsertUsers(User);
  const principalUser = usersByEmail.get('principal@demo.school');
  await step('upsertNotices', () => upsertNotices(db, principalUser._id));

  const teacherUser = usersByEmail.get('teacher@demo.school');
  const teacher = await upsertTeacher(db, teacherUser);
  const klass = await upsertClass(db, teacher);
  await step('upsertExtraClasses', () => upsertExtraClasses(db));
  await step('upsertExtraTeachers', () => upsertExtraTeachers(db));
  const students = await upsertStudents(db);
  await step('upsertExtraClassStudents', () => upsertExtraClassStudents(db));
  const subjects = await upsertSubjects(db);
  const mathTopics = await upsertMathSyllabus(db, subjects.get('MATH8'));
  await step('upsertScienceSyllabus', () => upsertScienceSyllabus(db, subjects.get('SCI8')));
  await step('upsertTimetable', () => upsertTimetable(db, { klass, teacher, subjects }));
  await step('upsertSyllabusProgress', () => upsertSyllabusProgress(db, { klass, topics: mathTopics, teacherUser }));
  await step('upsertStudyMaterials', () => upsertStudyMaterials(db, { klass, teacher, subjects, mathTopics }));
  await step('upsertDocuments', () => upsertDocuments(db, { teacher, teacherUser, principalUser }));
  await step('upsertHomework', () => upsertHomework(db, { klass, teacher, teacherUser, subjects, students }));
  await step('upsertAttendance', () => upsertAttendance(db, { klass, students, teacherUser }));
  await step('upsertStudentAccounts', () => upsertStudentAccounts(db, { students }));
  await step('upsertFeeTransactions', () => upsertFeeTransactions(db, { students, actorId: principalUser._id }));
  await step('upsertExamScheduling (legacy)', () => upsertExamScheduling(db, { klass, subjects, actorId: principalUser._id }));
  await step('upsertExaminations', () => upsertExaminations(db, { students, actorId: principalUser._id }));
  await step('upsertEvents', () => upsertEvents(db, { actorId: principalUser._id, teacherUser }));
  await step('upsertCaretaker', () => upsertCaretaker(db, { students, actorId: principalUser._id }));
  await step('upsertExtraCaretakers', () => upsertExtraCaretakers(db, { actorId: principalUser._id }));
  await step('upsertLeaveRequests', () => upsertLeaveRequests(db, { teacher, actorId: principalUser._id }));

  logger.info(`Seed complete. School Code: demo | password: ${DEFAULT_PASSWORD}`);
  await connectionManager.closeAll();
  process.exit(0);
}

seed().catch((err) => {
  logger.error(`Seed failed: ${err.stack || err.message}`);
  process.exit(1);
});
