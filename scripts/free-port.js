'use strict';

/**
 * Frees the dev server port before nodemon starts.
 *
 * Windows + nodemon frequently orphans the old `node.exe` on restart, and
 * stale processes from closed terminals keep holding the port. Running this
 * as an npm `predev` hook guarantees a clean bind every time.
 *
 * Zero dependencies. Cross-platform (Windows / macOS / Linux).
 * Only touches the process listening on the target port — nothing else.
 */

const { execSync } = require('child_process');

// Keep this in sync with your .env PORT (default 5000).
const PORT = process.env.PORT || 5000;
const isWindows = process.platform === 'win32';

function findPidsWindows() {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${PORT}`, { encoding: 'utf8' });
  } catch {
    return []; // findstr exits non-zero when there are no matches
  }
  const pids = new Set();
  for (const line of out.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    // Example: TCP  0.0.0.0:5000  0.0.0.0:0  LISTENING  12345
    if (parts.length < 5) continue;
    const local = parts[1] || '';
    const state = parts[3] || '';
    const pid = parts[parts.length - 1];
    if (local.endsWith(`:${PORT}`) && state === 'LISTENING' && /^\d+$/.test(pid)) {
      if (pid !== '0') pids.add(pid);
    }
  }
  return [...pids];
}

function findPidsPosix() {
  try {
    const out = execSync(`lsof -ti tcp:${PORT} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function kill(pid) {
  try {
    if (isWindows) execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    else execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const pids = isWindows ? findPidsWindows() : findPidsPosix();

if (pids.length === 0) {
  console.log(`[free-port] Port ${PORT} is free.`);
} else {
  console.log(`[free-port] Port ${PORT} held by PID(s): ${pids.join(', ')} — freeing...`);
  for (const pid of pids) {
    console.log(`[free-port] ${kill(pid) ? 'killed' : 'could not kill'} PID ${pid}`);
  }
}