'use strict';

const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { securityMiddlewares } = require('./middlewares/security');
const requestLogger = require('./middlewares/requestLogger');
const { globalLimiter } = require('./middlewares/rateLimiter');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const apiRouter = require('./routes');

/**
 * Builds the Express application. Middleware order matters and is deliberate:
 *   1. trust proxy (behind Nginx/ELB) so client IPs + secure cookies work
 *   2. body / cookie parsers
 *   3. security stack (helmet, cors, sanitize, hpp, xss)
 *   4. compression
 *   5. request logging
 *   6. global rate limiting
 *   7. routes
 *   8. 404 + centralized error handler (always LAST)
 */
function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  securityMiddlewares().forEach((mw) => app.use(mw));

  app.use(compression());
  app.use(requestLogger);
  app.use(globalLimiter);

  // Versioned API surface.
  app.use(config.apiPrefix, apiRouter);

  // Fallbacks — must remain the final two handlers.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = createApp;
