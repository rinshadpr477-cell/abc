// ESLint 10 flat config (CommonJS project). No extra dependencies: @eslint/js ships with ESLint.
const js = require('@eslint/js');

const nodeGlobals = {
  require: 'readonly', module: 'writable', exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
  process: 'readonly', console: 'readonly', Buffer: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly', fetch: 'readonly', AbortController: 'readonly',
  structuredClone: 'readonly', queueMicrotask: 'readonly',
};

// Vitest runs with `globals: true` (see vitest.config.js).
const vitestGlobals = {
  describe: 'readonly', test: 'readonly', it: 'readonly', expect: 'readonly', vi: 'readonly',
  beforeAll: 'readonly', afterAll: 'readonly', beforeEach: 'readonly', afterEach: 'readonly',
};

module.exports = [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', 'build/**', '.env', '.env.*', '*.log'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: nodeGlobals },
    rules: {
      'no-unused-vars': ['error', { args: 'after-used', argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },
  {
    files: ['src/tests/**/*.js'],
    languageOptions: { globals: { ...nodeGlobals, ...vitestGlobals } },
  },
];
