'use strict';

const morgan = require('morgan');
const config = require('../config');
const logger = require('../config/logger');

// Include tenant + user context when available for traceable request logs.
morgan.token('tenant', (req) => (req.tenant ? req.tenant.slug : '-'));
morgan.token('user', (req) => (req.user ? String(req.user.id) : '-'));

const format = config.isProd
  ? ':remote-addr :method :url :status :res[content-length] - :response-time ms tenant=:tenant user=:user'
  : ':method :url :status :response-time ms tenant=:tenant';

const requestLogger = morgan(format, {
  stream: logger.stream,
  skip: () => config.isTest,
});

module.exports = requestLogger;
