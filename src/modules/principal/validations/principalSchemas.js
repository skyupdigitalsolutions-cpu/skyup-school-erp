'use strict';

const Joi = require('joi');

// ── Reusable sub-schemas ──────────────────────────────────────────────────────
const objectId = Joi.string().hex().length(24).messages({
  'string.hex': '{{#label}} must be a valid ObjectId',
  'string.length': '{{#label}} must be a valid ObjectId',
});

const address = Joi.object({
  line1: Joi.string().max(200).allow('', null),
  line2: Joi.string().max(200).allow('', null),
  city: Joi.string().max(100).allow('', null),
  state: Joi.string().max(100).allow('', null),
  pincode: Joi.string().max(10).allow('', null),
  country: Joi.string().max(100).default('India'),
});

const STUDENT_STATUSES = ['active', 'inactive', 'suspended', 'transferred', 'archived', 'alumni'];
const TEACHER_STATUSES = ['active', 'inactive', 'on_leave', 'suspended', 'resigned', 'archived'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GENDERS = ['male', 'female', 'other'];

// ── Student schemas ───────────────────────────────────────────────────────────
const createStudentSchema = Joi.object({
  admissionNo: Joi.string().trim().max(50).required(),
  rollNo: Joi.string().trim().max(20).allow('', null),
  photo: Joi.string().uri().allow('', null),
  status: Joi.string().valid(...STUDENT_STATUSES).default('active'),

  personal: Joi.object({
    firstName: Joi.string().trim().max(100).required(),
    lastName: Joi.string().trim().max(100).required(),
    dateOfBirth: Joi.date().max('now').allow(null),
    gender: Joi.string().valid(...GENDERS).allow(null),
    bloodGroup: Joi.string().valid(...BLOOD_GROUPS).allow(null),
    nationality: Joi.string().max(100).allow('', null),
    religion: Joi.string().max(100).allow('', null),
    address: address,
    phone: Joi.string().max(20).allow('', null),
    email: Joi.string().email().lowercase().allow('', null),
  }).required(),

  academic: Joi.object({
    academicYear: Joi.string().required(),
    class: Joi.string().required(),
    section: Joi.string().required(),
    house: Joi.string().max(100).allow('', null),
    admissionDate: Joi.date().allow(null),
    subjects: Joi.array().items(Joi.string()),
  }).required(),

  parent: Joi.object({
    father: Joi.object({
      name: Joi.string().max(100).allow('', null),
      phone: Joi.string().max(20).allow('', null),
      email: Joi.string().email().allow('', null),
      occupation: Joi.string().max(100).allow('', null),
    }),
    mother: Joi.object({
      name: Joi.string().max(100).allow('', null),
      phone: Joi.string().max(20).allow('', null),
      email: Joi.string().email().allow('', null),
      occupation: Joi.string().max(100).allow('', null),
    }),
    guardian: Joi.object({
      name: Joi.string().max(100).allow('', null),
      phone: Joi.string().max(20).allow('', null),
      email: Joi.string().email().allow('', null),
      relation: Joi.string().max(50).allow('', null),
    }),
    primaryContact: Joi.string().valid('father', 'mother', 'guardian').default('father'),
  }),

  transport: Joi.object({
    enrolled: Joi.boolean(),
    routeNo: Joi.string().allow('', null),
    stopName: Joi.string().allow('', null),
    vehicleNo: Joi.string().allow('', null),
  }),

  hostel: Joi.object({
    enrolled: Joi.boolean(),
    hostelName: Joi.string().allow('', null),
    roomNo: Joi.string().allow('', null),
  }),

  medical: Joi.object({
    allergies: Joi.array().items(Joi.string()),
    conditions: Joi.array().items(Joi.string()),
    medications: Joi.array().items(Joi.string()),
    emergencyContact: Joi.string().max(20).allow('', null),
    notes: Joi.string().max(1000).allow('', null),
  }),
});

const updateStudentSchema = createStudentSchema.fork(
  ['admissionNo', 'personal', 'academic'],
  (s) => s.optional()
);

const changeStatusSchema = Joi.object({
  status: Joi.string().valid(...STUDENT_STATUSES).required(),
});

const bulkPromoteSchema = Joi.object({
  ids: Joi.array().items(objectId).min(1).required(),
  newClass: Joi.string().required(),
  newSection: Joi.string().required(),
  newAcademicYear: Joi.string().required(),
});

const bulkStudentStatusSchema = Joi.object({
  ids: Joi.array().items(objectId).min(1).required(),
  status: Joi.string().valid(...STUDENT_STATUSES).required(),
});

const behaviourNoteSchema = Joi.object({
  note: Joi.string().max(2000).required(),
  type: Joi.string().valid('positive', 'negative', 'neutral').default('neutral'),
  date: Joi.date().allow(null),
});

const awardSchema = Joi.object({
  title: Joi.string().max(200).required(),
  description: Joi.string().max(1000).allow('', null),
  date: Joi.date().allow(null),
  category: Joi.string().max(100).allow('', null),
});

const documentSchema = Joi.object({
  name: Joi.string().max(200).required(),
  type: Joi.string().max(100).allow('', null),
  url: Joi.string().uri().required(),
});

const listStudentQuery = Joi.object({
  q: Joi.string().max(100).allow('', null),
  academicYear: Joi.string().allow('', null),
  class: Joi.string().allow('', null),
  section: Joi.string().allow('', null),
  house: Joi.string().allow('', null),
  status: Joi.string().valid(...STUDENT_STATUSES, '').allow(null),
  gender: Joi.string().valid(...GENDERS, '').allow(null),
  transport: Joi.string().valid('yes', 'no', '').allow(null),
  hostel: Joi.string().valid('yes', 'no', '').allow(null),
  medicalAlert: Joi.string().valid('yes', 'no', '').allow(null),
  feeStatus: Joi.string().valid('paid', 'partial', 'due', 'overdue', '').allow(null),
  attendanceBelow: Joi.number().min(0).max(100).allow(null),
  admissionFrom: Joi.date().allow(null),
  admissionTo: Joi.date().allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string()
    .valid('createdAt', 'admissionNo', 'personal.firstName', 'academic.class')
    .default('createdAt'),
});

// ── Teacher schemas ───────────────────────────────────────────────────────────
const createTeacherSchema = Joi.object({
  employeeId: Joi.string().trim().max(50).required(),
  photo: Joi.string().uri().allow('', null),
  status: Joi.string().valid(...TEACHER_STATUSES).default('active'),

  personal: Joi.object({
    firstName: Joi.string().trim().max(100).required(),
    lastName: Joi.string().trim().max(100).required(),
    dateOfBirth: Joi.date().max('now').allow(null),
    gender: Joi.string().valid(...GENDERS).allow(null),
    bloodGroup: Joi.string().valid(...BLOOD_GROUPS).allow(null),
    nationality: Joi.string().max(100).allow('', null),
    phone: Joi.string().max(20).required(),
    email: Joi.string().email().lowercase().required(),
    emergencyContact: Joi.object({
      name: Joi.string().max(100).allow('', null),
      phone: Joi.string().max(20).allow('', null),
      relation: Joi.string().max(50).allow('', null),
    }),
    address: address,
  }).required(),

  professional: Joi.object({
    department: Joi.string().required(),
    designation: Joi.string().required(),
    employmentType: Joi.string()
      .valid('permanent', 'contract', 'part_time', 'visiting')
      .default('permanent'),
    joiningDate: Joi.date().allow(null),
    experienceYears: Joi.number().min(0).default(0),
  }).required(),

  qualifications: Joi.array().items(
    Joi.object({
      degree: Joi.string().max(200).required(),
      specialization: Joi.string().max(200).allow('', null),
      institution: Joi.string().max(300).allow('', null),
      yearOfPassing: Joi.number().integer().min(1900).max(new Date().getFullYear()),
      grade: Joi.string().max(50).allow('', null),
    })
  ),

  payroll: Joi.object({
    basicSalary: Joi.number().min(0),
    grossSalary: Joi.number().min(0),
    bankName: Joi.string().max(200).allow('', null),
    accountNo: Joi.string().max(50).allow('', null),
    ifscCode: Joi.string().max(20).allow('', null),
  }),
});

const updateTeacherSchema = createTeacherSchema.fork(
  ['employeeId', 'personal', 'professional'],
  (s) => s.optional()
);

const changeTeacherStatusSchema = Joi.object({
  status: Joi.string().valid(...TEACHER_STATUSES).required(),
});

const bulkTeacherStatusSchema = Joi.object({
  ids: Joi.array().items(objectId).min(1).required(),
  status: Joi.string().valid(...TEACHER_STATUSES).required(),
});

const assignSubjectsSchema = Joi.object({
  subjects: Joi.array()
    .items(
      Joi.object({
        subject: Joi.string().required(),
        class: Joi.string().required(),
        section: Joi.string().required(),
        academicYear: Joi.string().required(),
        isClassTeacher: Joi.boolean().default(false),
      })
    )
    .required(),
});

const performanceReviewSchema = Joi.object({
  rating: Joi.number().min(0).max(5).required(),
  remarks: Joi.string().max(2000).allow('', null),
  date: Joi.date().allow(null),
});

const teacherDocumentSchema = documentSchema;

const assignAssetSchema = Joi.object({
  assetName: Joi.string().max(200).required(),
  assetId: Joi.string().max(100).allow('', null),
  assignedDate: Joi.date().allow(null),
});

const aiInsightsSchema = Joi.object({
  summary: Joi.string().max(2000).allow('', null),
  strengths: Joi.array().items(Joi.string().max(200)),
  areasOfImprovement: Joi.array().items(Joi.string().max(200)),
});

const listTeacherQuery = Joi.object({
  q: Joi.string().max(100).allow('', null),
  department: Joi.string().allow('', null),
  designation: Joi.string().allow('', null),
  employmentType: Joi.string()
    .valid('permanent', 'contract', 'part_time', 'visiting', '')
    .allow(null),
  status: Joi.string().valid(...TEACHER_STATUSES, '').allow(null),
  subject: Joi.string().allow('', null),
  class: Joi.string().allow('', null),
  academicYear: Joi.string().allow('', null),
  joiningFrom: Joi.date().allow(null),
  joiningTo: Joi.date().allow(null),
  experienceMin: Joi.number().min(0).allow(null),
  experienceMax: Joi.number().min(0).allow(null),
  attendanceBelow: Joi.number().min(0).max(100).allow(null),
  performanceAbove: Joi.number().min(0).max(5).allow(null),
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string()
    .valid('createdAt', 'employeeId', 'personal.firstName', 'professional.department', 'professional.joiningDate')
    .default('createdAt'),
});

module.exports = {
  // Student
  createStudentSchema,
  updateStudentSchema,
  changeStatusSchema,
  bulkPromoteSchema,
  bulkStudentStatusSchema,
  behaviourNoteSchema,
  awardSchema,
  documentSchema,
  listStudentQuery,
  // Teacher
  createTeacherSchema,
  updateTeacherSchema,
  changeTeacherStatusSchema,
  bulkTeacherStatusSchema,
  assignSubjectsSchema,
  performanceReviewSchema,
  teacherDocumentSchema,
  assignAssetSchema,
  aiInsightsSchema,
  listTeacherQuery,
};
