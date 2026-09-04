'use strict';

const cloudinary = require('cloudinary').v2;
const asyncHandler = require('../../../core/asyncHandler');
const ApiResponse = require('../../../core/ApiResponse');
const ApiError = require('../../../core/ApiError');
const config = require('../../../config');

let configured = false;

/**
 * Cloudinary credentials are optional at the config level (default to empty
 * strings) so the server can boot without them — but an actual upload
 * request needs them. Configuring lazily (once, on first real upload)
 * rather than at module-load time keeps a missing-credentials deployment
 * from crashing on startup; it just can't serve uploads until fixed.
 */
function ensureConfigured() {
  if (configured) return;
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  if (!cloudName || !apiKey || !apiSecret) {
    throw ApiError.internal(
      'Image upload is not configured on this server. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.'
    );
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  configured = true;
}

function uploadBuffer(buffer, folder, resourceType) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder, resource_type: resourceType }, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
    stream.end(buffer);
  });
}

/**
 * POST /uploads?folder=events — multipart, one or more files under the
 * "files" field. Matches the contract the frontend's lib/upload.js (and
 * AddStudent.jsx's document uploader) already call — this endpoint simply
 * didn't exist before. Accepts images and common document types (PDF, Word)
 * since the same helper is used for both event photos and student/teacher
 * document uploads; Cloudinary is told `resource_type: 'auto'` so it stores
 * non-image files correctly too.
 */
const uploadFiles = asyncHandler(async (req, res) => {
  ensureConfigured();

  const files = req.files || [];
  if (files.length === 0) throw ApiError.badRequest('No file(s) provided. Attach them under the "files" field.');

  const folderSlug = String(req.query.folder || 'general').replace(/[^a-z0-9_-]/gi, '') || 'general';
  const folder = `schoolerp/${req.tenant?.slug || 'default'}/${folderSlug}`;

  const results = [];
  for (const file of files) {
    const isImage = file.mimetype.startsWith('image/');
    let result;
    try {
      result = await uploadBuffer(file.buffer, folder, isImage ? 'image' : 'auto');
    } catch (err) {
      throw ApiError.internal(`Upload failed for "${file.originalname}": ${err.message || 'unknown error'}`);
    }
    results.push({
      originalName: file.originalname,
      storedName: result.public_id,
      mimeType: file.mimetype,
      size: file.size,
      url: result.secure_url,
    });
  }

  return ApiResponse.ok(res, results, 'File(s) uploaded.');
});

module.exports = { uploadFiles };
