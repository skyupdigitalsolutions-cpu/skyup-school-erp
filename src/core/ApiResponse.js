'use strict';

/**
 * Uniform success envelope so every endpoint returns the same shape:
 *   { success, message, data, meta }
 * Keeping this centralized means clients never have to special-case responses.
 */
class ApiResponse {
  /**
   * @param {import('express').Response} res
   * @param {object} [opts]
   * @param {number} [opts.statusCode=200]
   * @param {string} [opts.message='Success']
   * @param {*}      [opts.data=null]
   * @param {object} [opts.meta]  pagination / counts / etc.
   */
  static send(res, { statusCode = 200, message = 'Success', data = null, meta } = {}) {
    const body = { success: true, message, data };
    if (meta !== undefined) body.meta = meta;
    return res.status(statusCode).json(body);
  }

  static ok(res, data, message = 'Success', meta) {
    return ApiResponse.send(res, { statusCode: 200, message, data, meta });
  }

  static created(res, data, message = 'Created') {
    return ApiResponse.send(res, { statusCode: 201, message, data });
  }

  static noContent(res) {
    return res.status(204).send();
  }
}

module.exports = ApiResponse;
