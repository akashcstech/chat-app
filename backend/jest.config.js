/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 30000,
  forceExit: true,
  // sanitize-html v2.17 bundles htmlparser2 v12 which ships as pure ESM.
  // ts-jest runs in CJS mode, so Jest cannot parse those files.
  // Fix: redirect every require('htmlparser2') to the top-level htmlparser2
  // v10 install (which ships a proper CommonJS bundle) so the test runner
  // never has to touch the ESM-only nested copy.
  moduleNameMapper: {
    '^htmlparser2$': '<rootDir>/node_modules/htmlparser2/dist/commonjs/index.js',
    '^htmlparser2/(.*)$': '<rootDir>/node_modules/htmlparser2/dist/commonjs/$1',
  },
};
