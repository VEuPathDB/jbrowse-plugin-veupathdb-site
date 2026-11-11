/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // @jbrowse/core is ESM-only; see jest.resolver.js
  resolver: '<rootDir>/jest.resolver.js',
  setupFiles: ['<rootDir>/jest.setup.js'],
  setupFilesAfterEnv: ['@testing-library/jest-dom'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transformIgnorePatterns: [
    'node_modules/.pnpm/(?!(@jbrowse\\+|@gmod\\+|generic-filehandle|quick-lru|nanoid|rxjs))',
  ],
  transform: {
    // transpile only; type checking is `tsc --noEmit`'s job
    '^.+\\.tsx?$': [
      'ts-jest',
      { tsconfig: 'tsconfig.test.json', isolatedModules: true },
    ],
    '^.+\\.m?jsx?$': ['babel-jest', { configFile: './babel.jest.js' }],
  },
}
