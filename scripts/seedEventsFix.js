'use strict';

/**
 * Standalone events-fix script.
 *
 * Run with: node scripts/seedEventsFix.js
 *
 * Fixes, independent of the main seed.js:
 *  - Seeded event categories were lowercase ('sports') while the frontend's
 *    category filter dropdown offers capitalized values ('Sports') — an
 *    exact-match filter, so selecting any category returned nothing.
 *  - Adds `committees` (task assignments to specific teachers/staff),
 *    `photos`, and an `approval` trail (requested/approved by + notes) to
 *    the seeded events, exercising the newer Event Management features.
 *
 * Safe to re-run — every write is keyed by eventId (upsert).
 */

require('../src/modules/authentication/models/user.model');
require('../src/modules/events/models/Event');

const logger = require('../src/config/logger');
const connectionManager = require('../src/database/connectionManager');
const { getTenantModel } = require('../src/database/tenantRegistry');

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
  const Event = db.model('Event');
  const User = db.model('User');

  const principalUser = await User.findOne({ email: 'principal@demo.school' });
  const teacherUser = await User.findOne({ email: 'teacher@demo.school' });
  if (!principalUser) {
    logger.error('principal@demo.school not found — run the main seed.js first.');
    process.exit(1);
  }
  const actorId = principalUser._id;
  const now = Date.now();

  // Keyed by eventId — matches whatever the main seed.js already created.
  // Each entry here OVERWRITES category/committees/photos/approval on the
  // existing document without touching schedule/venue/description.
  const FIXES = [
    {
      eventId: 'EVT-2024-SPORTS', category: 'Sports',
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
      eventId: 'EVT-2024-FOUNDERS', category: 'Cultural',
      committees: [{ role: 'coordinator', name: 'Neha Kapoor', responsibility: 'Cultural program direction and student rehearsals.' }],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 55 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 53 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-SCIFAIR', category: 'Science Fair',
      committees: [{ role: 'coordinator', name: 'Rohan Bhatt', responsibility: 'Draft proposal — science department lead.' }],
    },
    {
      eventId: 'EVT-2024-TRIP', category: 'Field Trip',
      committees: [
        { role: 'coordinator', name: 'Tariq Teacher', userId: teacherUser?._id || null, responsibility: 'Chaperone lead and transport coordination.' },
        { role: 'staff', name: 'Manoj Yadav', responsibility: 'Bus driver for the excursion route.' },
      ],
      approval: { requestedBy: teacherUser?._id || actorId, requestedAt: new Date(now - 2 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-PARENTMEET', category: 'Academic',
      approval: { requestedBy: actorId, requestedAt: new Date(now - 5 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 4 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-INDEPENDENCE', category: 'Cultural',
      photos: [{ url: 'https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=800', caption: 'Flag hoisting ceremony' }],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 25 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 23 * DAY_MS) },
    },
    {
      eventId: 'EVT-2024-QUIZ', category: 'Competition',
      committees: [{ role: 'coordinator', name: 'Sunita Pillai', responsibility: 'Question bank preparation and house coordination.' }],
      approval: { requestedBy: actorId, requestedAt: new Date(now - 6 * DAY_MS), approvedBy: actorId, approvedAt: new Date(now - 5 * DAY_MS) },
    },
  ];

  let updated = 0;
  for (const fix of FIXES) {
    const { eventId, ...set } = fix;
    const result = await Event.updateOne({ eventId }, { $set: set });
    if (result.matchedCount > 0) {
      updated += 1;
      logger.info(`Updated ${eventId}: category=${set.category}${set.committees ? `, ${set.committees.length} committee member(s)` : ''}${set.photos ? `, ${set.photos.length} photo(s)` : ''}`);
    } else {
      logger.warn(`No event found with eventId ${eventId} — skipped (run the main seed.js first to create it).`);
    }
  }

  const categories = await Event.distinct('category');
  logger.info(`Done. ${updated} event(s) updated. Distinct categories now in DB: [${categories.join(', ')}]`);

  await connectionManager.closeAll();
  process.exit(0);
}

run().catch((err) => {
  logger.error('seedEventsFix failed:');
  logger.error(err.stack || err.message || err);
  process.exit(1);
});
