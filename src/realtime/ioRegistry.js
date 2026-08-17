'use strict';

/**
 * Holds the live Socket.IO server instance so business-logic services (e.g.
 * CaretakerTransportService, when a trip completes) can emit an event
 * without importing `server.js` directly (which would create a layering
 * cycle: server.js creates the app/services, services can't import it back).
 */
let ioInstance = null;

function setIo(io) { ioInstance = io; }
function getIo() { return ioInstance; }

module.exports = { setIo, getIo };
