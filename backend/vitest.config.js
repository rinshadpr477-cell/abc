const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/**/*.test.js'],
    globalSetup: ['./src/tests/globalSetup.js'],
    fileParallelism: false, // suites share one in-memory replica set; each uses its own database
    testTimeout: 60000,
    hookTimeout: 60000,
    pool: 'forks',
  },
});
