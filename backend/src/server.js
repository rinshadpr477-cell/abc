const env = require('./config/environment');
const { connectDatabase, disconnectDatabase } = require('./config/database');
const app = require('./app');

async function main() {
  await connectDatabase();
  // Make sure unique/partial indexes exist before accepting traffic.
  await Promise.all(Object.values(require('mongoose').models).map((m) => m.init()));

  const server = app.listen(env.PORT, () => {
    console.log(`API listening on http://localhost:${env.PORT}  (docs: /api-docs)`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});
