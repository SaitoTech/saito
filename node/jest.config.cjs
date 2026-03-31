const legacySpecIgnores = [
  '<rootDir>/lib/saito/block.spec.ts',
  '<rootDir>/lib/saito/crypto.spec.ts',
  '<rootDir>/lib/saito/peer.spec.ts',
  '<rootDir>/lib/saito/slip.spec.ts',
  '<rootDir>/lib/saito/core/storage-core.spec.ts',
];

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/lib'],
  testMatch: ['**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  watchPathIgnorePatterns: ['<rootDir>/dist/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/', ...legacySpecIgnores],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/config/build/tsconfig.json',
        diagnostics: false,
      },
    ],
  },
  moduleNameMapper: {
    '^saito-js$': '<rootDir>/node_modules/saito-js/dist/index.node.js',
    '^saito-js/(.*)$': '<rootDir>/node_modules/saito-js/dist/$1',
  },
};