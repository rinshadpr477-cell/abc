const mongoose = require('mongoose');

/**
 * Runs `fn(session)` in a MongoDB transaction and returns its result.
 * Transient write conflicts (two transactions touching the same document) are retried by the driver,
 * so the loser re-reads the committed state and re-validates. The callback may therefore run more
 * than once and must not have side effects outside the session.
 */
async function inTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { inTransaction };
