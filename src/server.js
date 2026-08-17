'use strict';

const http = require('http');
const { Server } = require('socket.io');
const config = require('./config');
const logger = require('./config/logger');
const connectionManager = require('./database/connectionManager');
const createApp = require('./app');
const { attachTrackingNamespace } = require('./realtime/trackingNamespace');
const { setIo } = require('./realtime/ioRegistry');

// How many times to retry binding the port, and how long to wait between
// tries. On Windows, nodemon force-kills the old process on restart and the
// OS releases the listening socket only after a short delay — so a fresh
// process can momentarily hit EADDRINUSE. Retrying a few times lets the
// restart race resolve itself instead of crashing.
const LISTEN_MAX_RETRIES = 5;
const LISTEN_RETRY_DELAY_MS = 700;

let server;
let isShuttingDown = false;

function listenWithRetry(app, retriesLeft) {
  server = http.createServer(app);

  // Real-time bus tracking (see src/realtime/trackingNamespace.js) shares
  // this same HTTP server/port — no separate process or port to manage.
  const io = new Server(server, {
    cors: { origin: config.corsOrigins, credentials: true },
  });
  attachTrackingNamespace(io);
  setIo(io);

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && retriesLeft > 0) {
      logger.warn(
        `Port ${config.port} busy (likely a restart still releasing it). ` +
          `Retrying in ${LISTEN_RETRY_DELAY_MS}ms — ${retriesLeft} attempt(s) left...`
      );
      server.close();
      setTimeout(() => listenWithRetry(app, retriesLeft - 1), LISTEN_RETRY_DELAY_MS);
      return;
    }

    if (err.code === 'EADDRINUSE') {
      logger.error(
        `Port ${config.port} is still in use after ${LISTEN_MAX_RETRIES} ` +
          `retries. Another server or a leftover node process owns it.`
      );
      logger.error(
        'Free the port and try again:\n' +
          `  Windows : netstat -ano | findstr :${config.port}   ` +
          '->  taskkill /PID <PID> /F\n' +
          `  macOS/Linux : lsof -ti :${config.port} | xargs kill -9`
      );
    } else {
      logger.error(`HTTP server error: ${err.stack || err.message}`);
    }
    process.exit(1);
  });

  server.listen(config.port, () => {
    logger.info(
      `School ERP API listening on port ${config.port} [${config.env}] ` +
        `(prefix ${config.apiPrefix})`
    );
  });
}

async function start() {
  // Fail fast: the process must not accept traffic without a database.
  await connectionManager.connect();

  const app = createApp();
  listenWithRetry(app, LISTEN_MAX_RETRIES);
}

/** Close HTTP server and DB connections before exiting. */
async function shutdown(signal) {
  // Guard against overlapping shutdowns (e.g. multiple signals arriving
  // during a restart). Running closeAll() twice can throw and leave the
  // process — and the port — in a bad state.
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`${signal} received — shutting down gracefully...`);
  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await connectionManager.closeAll();
    logger.info('Shutdown complete.');
    process.exit(0);
  } catch (err) {
    logger.error(`Error during shutdown: ${err.message}`);
    process.exit(1);
  }
}

['SIGINT', 'SIGTERM'].forEach((sig) =>
  process.on(sig, () => shutdown(sig))
);

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled Rejection: ${reason}`);
  shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.stack || err.message}`);
  shutdown('uncaughtException');
});

start().catch((err) => {
  logger.error(`Failed to start server: ${err.stack || err.message}`);
  process.exit(1);
});