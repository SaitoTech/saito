// These archived specs contain only commented-out tests.
const legacySpecIgnores = [
  '<rootDir>/tests/lib/saito/block.spec.ts',
  '<rootDir>/tests/lib/saito/crypto.spec.ts',
  '<rootDir>/tests/lib/saito/peer.spec.ts',
  '<rootDir>/tests/lib/saito/slip.spec.ts',
  '<rootDir>/tests/lib/saito/core/storage-core.spec.ts'
];

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/mods/registry/tests'],
  testMatch: ['**/*.spec.ts', '**/*.spec.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  watchPathIgnorePatterns: ['<rootDir>/dist/'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/dist/', ...legacySpecIgnores],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  // ts-jest 27 reads its options from globals.
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/config/build/tsconfig.json',
      diagnostics: false
    }
  },
  moduleNameMapper: {
    '^saito-js$': '<rootDir>/node_modules/saito-js/index.node.js',
    '^saito-js/(.*)$': '<rootDir>/node_modules/saito-js/$1'
  }
};
