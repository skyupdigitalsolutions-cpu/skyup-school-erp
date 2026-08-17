'use strict';
const express = require('express');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const { requireRoles } = require('../../../middlewares/authorize');
const { validate } = require('../../../middlewares/validate');
const { ROLES } = require('../../../utils/constants');
const C = require('../controllers/StudyMaterialController');
const V = require('../validations/studyMaterialSchemas');

const router = express.Router();
router.use(tenantResolver, authenticate);

const teacherOnly = requireRoles(ROLES.TEACHER);

router.get('/mine', teacherOnly, validate({ query: V.listQuery }), C.listMine);
router.post('/', teacherOnly, validate({ body: V.createSchema }), C.create);
router.patch('/:id', teacherOnly, validate({ params: V.idParamSchema, body: V.updateSchema }), C.update);
router.delete('/:id', teacherOnly, validate({ params: V.idParamSchema }), C.remove);

module.exports = router;
