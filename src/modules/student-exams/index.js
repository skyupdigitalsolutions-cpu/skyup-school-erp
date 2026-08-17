'use strict';
// Student-exams has no schema of its own — it's a read-only, student-scoped
// view over the exam-scheduling module's Exam/ExamSchedule/ExamMark models
// (NOT the legacy Examination model). Re-requiring these is safe/idempotent
// — Node caches by resolved file path, so this doesn't re-run registerModel
// even if exam-scheduling's own index.js already did.
require('../exam-scheduling/models/Exam');
require('../exam-scheduling/models/ExamSchedule');
require('../exam-scheduling/models/ExamMark');
module.exports = require('./routes');
