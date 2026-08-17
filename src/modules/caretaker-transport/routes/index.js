'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/CaretakerTransportController');
const V = require('../validations/caretakerTransportSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const caretakerOnly = requireRoles(ROLES.CARETAKER);

router.get('/my-routes', caretakerOnly, C.getMyRoutes);
router.get('/trips', caretakerOnly, validate({ query: V.tripsQuerySchema }), C.listTrips);
router.post('/trips', caretakerOnly, validate({ body: V.startTripSchema }), C.startTrip);
router.patch('/trips/:id/arrive', caretakerOnly, validate({ params: V.idParamSchema }), C.arriveTrip);
router.post('/trips/:id/student-log', caretakerOnly, validate({ params: V.idParamSchema, body: V.studentLogSchema }), C.logStudent);

router.get('/profile', caretakerOnly, C.getProfile);
// stripUnknown:false — a forbidden field (route/vehicle/verificationStatus/
// documents) must be REJECTED, never silently ignored. See updateProfileSchema.
router.patch('/profile', caretakerOnly, validate({ body: V.updateProfileSchema }, { stripUnknown: false }), C.updateProfile);

// Principal/administrator live-tracking map — every currently in-progress
// trip, unscoped by route (see listActiveTrips's own role check too, as
// defense in depth).
router.get('/active-trips', requireRoles(ROLES.PRINCIPAL, ROLES.ADMINISTRATOR), C.listActiveTrips);

module.exports = router;
