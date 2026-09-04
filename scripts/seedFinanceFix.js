'use strict';

/**
 * Standalone finance-filter-fix script.
 *
 * Run with: node scripts/seedFinanceFix.js
 *
 * Adds the fee-type/status combinations missing from the original seed
 * (hostel, library, refunded) so the Finance page's filters have at least
 * one matching row for every option.
 *
 * Safe to re-run — every write is keyed by (student, feeType, academicYear).
 */

require('../src/modules/authentication/models/user.model');
require('../src/modules/principal/models/Student');
require('../src/modules/finance/models/FeeTransaction');

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
  const Student = db.model('Student');
  const FeeTransaction = db.model('FeeTransaction');
  const User = db.model('User');

  const principalUser = await User.findOne({ email: 'principal@demo.school' });
  const actorId = principalUser?._id || null;

  const diya = await Student.findOne({ admissionNo: 'ADM-1002' });
  if (!diya) {
    logger.error('ADM-1002 (Diya) not found — run the main seed.js first.');
    process.exit(1);
  }

  const now = Date.now();
  const rows = [
    { feeType: 'hostel', amount: 60000, status: 'paid', paymentMode: 'online', transactionRef: 'RCPT-2026-H0002', paidDate: new Date(now - 18 * DAY_MS) },
    { feeType: 'library', amount: 1500, status: 'refunded', paymentMode: 'cash', transactionRef: 'RCPT-2026-L0002', paidDate: new Date(now - 30 * DAY_MS) },
  ];

  let count = 0;
  for (const row of rows) {
    await FeeTransaction.findOneAndUpdate(
      { student: diya._id, feeType: row.feeType, academicYear: ACADEMIC_YEAR },
      { $set: { ...row, student: diya._id, academicYear: ACADEMIC_YEAR, createdBy: actorId, updatedBy: actorId } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    count += 1;
    logger.info(`Fee transaction upserted: ${row.feeType} / ${row.status} for Diya Verma.`);
  }

  const statuses = await FeeTransaction.distinct('status');
  const feeTypes = await FeeTransaction.distinct('feeType');
  logger.info(`Done. ${count} row(s) upserted. Distinct statuses now: [${statuses.join(', ')}]. Distinct feeTypes now: [${feeTypes.join(', ')}]`);

  await connectionManager.closeAll();
  process.exit(0);
}

run().catch((err) => {
  logger.error('seedFinanceFix failed:');
  logger.error(err.stack || err.message || err);
  process.exit(1);
});
