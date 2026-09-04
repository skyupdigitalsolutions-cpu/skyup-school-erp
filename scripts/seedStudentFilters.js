'use strict';

/**
 * Standalone student-filter-fix script.
 *
 * Run with: node scripts/seedStudentFilters.js
 *
 * Fixes, independent of the main seed.js:
 *  - `personal.gender` was never set on the 16 core students (defaults to
 *    null) — breaks the Gender filter entirely.
 *  - `feeStatus.status` was never set (defaults to schema's 'due' for all
 *    16) — breaks the Fee Status filter (e.g. selecting "paid" -> nothing).
 *  - All 16 students share `status: 'active'` — breaks the Status filter
 *    for every other option (inactive/suspended/etc.).
 *  - All 16 students are in class 8 — breaks the Class filter for every
 *    other grade. Adds 4 lightweight students in classes 6/7/9/10.
 *
 * Safe to re-run — every write is keyed by admissionNo (upsert / update).
 */

require('../src/modules/principal/models/Student');

const logger = require('../src/config/logger');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');

const ACADEMIC_YEAR = '2024-25';
const DAY_MS = 24 * 60 * 60 * 1000;

const GENDERS = {
  'ADM-1001': 'male', 'ADM-1002': 'female', 'ADM-1003': 'male', 'ADM-1004': 'female',
  'ADM-1005': 'male', 'ADM-1006': 'female', 'ADM-1007': 'male', 'ADM-1008': 'female',
  'ADM-1009': 'male', 'ADM-1010': 'female', 'ADM-1011': 'male', 'ADM-1012': 'female',
  'ADM-1013': 'male', 'ADM-1014': 'female', 'ADM-1015': 'male', 'ADM-1016': 'female',
};

const FEE_STATUS_CYCLE = ['paid', 'paid', 'due', 'partial', 'overdue'];

const EXTRA_CLASS_STUDENTS = [
  { admissionNo: 'ADM-2001', rollNo: '1', firstName: 'Naveen', lastName: 'Reddy', gender: 'male', class: '6', section: 'A', status: 'active' },
  { admissionNo: 'ADM-2002', rollNo: '1', firstName: 'Pooja', lastName: 'Shetty', gender: 'female', class: '7', section: 'A', status: 'transferred' },
  { admissionNo: 'ADM-2003', rollNo: '1', firstName: 'Farhan', lastName: 'Ali', gender: 'male', class: '9', section: 'A', status: 'inactive' },
  { admissionNo: 'ADM-2004', rollNo: '1', firstName: 'Lakshmi', lastName: 'Pillai', gender: 'female', class: '10', section: 'A', status: 'suspended' },
];

async function run() {
  await connectionManager.connect();

  const Tenant = getTenantModel(connectionManager.control());
  const tenant = await Tenant.findOne({ slug: 'demo' });
  if (!tenant) {
    logger.error('No tenant found with slug "demo". Run the main seed.js first to create the school.');
    process.exit(1);
  }

  const db = await connectionManager.getTenantConnection(tenant);
  const Student = db.model('Student');

  const admissionNos = Object.keys(GENDERS);
  let updated = 0;

  for (let i = 0; i < admissionNos.length; i += 1) {
    const admissionNo = admissionNos[i];
    const gender = GENDERS[admissionNo];
    const tuitionAmount = 42000 + (i % 3) * 1500;
    const feeStatusValue = FEE_STATUS_CYCLE[i % FEE_STATUS_CYCLE.length];
    const paidAmount = feeStatusValue === 'paid' ? tuitionAmount : feeStatusValue === 'partial' ? Math.round(tuitionAmount * 0.4) : 0;
    const status = i === 14 ? 'inactive' : i === 15 ? 'suspended' : 'active';

    const result = await Student.updateOne(
      { admissionNo },
      {
        $set: {
          status,
          'personal.gender': gender,
          feeStatus: {
            totalFee: tuitionAmount,
            paidAmount,
            dueAmount: tuitionAmount - paidAmount,
            lastPaidDate: feeStatusValue === 'paid' ? new Date(Date.now() - ((i % 20) + 1) * DAY_MS) : null,
            status: feeStatusValue,
          },
        },
      }
    );

    if (result.matchedCount > 0) {
      updated += 1;
      logger.info(`Updated ${admissionNo}: gender=${gender} status=${status} feeStatus=${feeStatusValue}`);
    } else {
      logger.warn(`No student found with admissionNo ${admissionNo} — skipped.`);
    }
  }

  let extraCreated = 0;
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
    extraCreated += 1;
    logger.info(`Extra class student upserted: ${s.admissionNo} (class ${s.class}, status ${s.status})`);
  }

  const totalStudents = await Student.countDocuments({});
  const byGender = await Student.countDocuments({ 'personal.gender': { $ne: null } });
  const byClass = await Student.distinct('academic.class');

  logger.info(`Done. ${updated} core student(s) updated, ${extraCreated} extra-class student(s) upserted.`);
  logger.info(`Verification: total students=${totalStudents}, students with gender set=${byGender}, distinct classes present=[${byClass.join(', ')}]`);

  await connectionManager.closeAll();
  process.exit(0);
}

run().catch((err) => {
  logger.error('seedStudentFilters failed:');
  logger.error(err.stack || err.message || err);
  process.exit(1);
});
