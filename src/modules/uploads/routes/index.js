'use strict';

const express = require('express');
const multer = require('multer');
const authenticate = require('../../../middlewares/authenticate');
const tenantResolver = require('../../../middlewares/tenantResolver');
const ctrl = require('../controllers/UploadController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = express.Router();
router.use(tenantResolver, authenticate);

// Any logged-in role can upload — the URL is only usable wherever the
// caller has permission to attach it (e.g. their own document, an event
// they can edit). Up to 10 files per request.
router.post('/', upload.array('files', 10), ctrl.uploadFiles);

module.exports = router;
