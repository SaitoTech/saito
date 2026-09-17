module.exports = {
  ...require('../../jest.config.cjs'),
  rootDir: require('path').resolve(__dirname, '../..'),
  testMatch: ['<rootDir>/tests/mods/bugs/**/*.spec.js'],
  clearMocks: true
};
