import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests for framework-independent logic (redirect validation, API client, checkout keys).
// They run in plain Node, so no browser/DOM dependency is needed.
// Windows note: run from a shell whose working directory starts with an UPPER-case drive letter
// ("C:\..."). With "c:\..." the same file gets two module ids and vitest fails with
// "Vitest failed to find the current suite" (see docs/TESTING.md).
export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  test: { environment: 'node', include: ['src/**/*.test.ts'], restoreMocks: true },
});
