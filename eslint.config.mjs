// Catches real mistakes (undefined names) and dead code (unused variables) in the Node files. The page's inline script is not covered.
const node = { require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly', console: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly', setImmediate: 'readonly', fetch: 'readonly', URL: 'readonly',
  URLSearchParams: 'readonly', WebSocket: 'readonly', AbortController: 'readonly', globalThis: 'readonly' };
export default [
  { ignores: ['**/node_modules/**', 'server/public/**', 'app/dist/**', 'app/release/**', 'data/**'] },
  { files: ['server/**/*.js', 'app/**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: node },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] } },
  { files: ['server/*-test.js'], rules: { 'no-unused-vars': 'off' } },
];
