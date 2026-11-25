const mongoose = require('mongoose');

const CONNECTED = 1;
const PING_TIMEOUT_MS = 2000;

/** Resolves true only if MongoDB answers a ping within the timeout. Never throws, never writes. */
async function databaseIsUp() {
  if (mongoose.connection.readyState !== CONNECTED) return false;
  let timer;
  try {
    const ping = mongoose.connection.db.admin().ping();
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('ping timeout')), PING_TIMEOUT_MS);
    });
    await Promise.race([ping, timeout]);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /health — 200 when the API and its database are reachable, 503 otherwise.
 * The body is deliberately minimal: no URIs, credentials, driver errors or stack traces.
 */
module.exports = async function health(_req, res) {
  if (await databaseIsUp()) return res.status(200).json({ success: true, data: { status: 'ok', database: 'up' } });
  return res.status(503).json({ success: false, code: 'SERVICE_UNAVAILABLE', message: 'Service unavailable', data: { status: 'unavailable', database: 'down' } });
};
module.exports.databaseIsUp = databaseIsUp;
