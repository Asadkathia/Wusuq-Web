/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '(personal-files/lib/magic-bytes|personal-files/personal-files\\.service)\\.spec\\.ts$',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: '<rootDir>/../tsconfig.jest-esm.json',
      },
    ],
  },
  moduleNameMapper: {
    '^@jest/globals$':
      '<rootDir>/../node_modules/.pnpm/@jest+globals@30.3.0/node_modules/@jest/globals/build/index.js',
  },
  testEnvironment: 'node',
};
