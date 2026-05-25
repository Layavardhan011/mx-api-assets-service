module.exports = {
  rootDir: '../..',
  testMatch: ['**/test/unit/scripts/*.test.js', '**/test/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  moduleNameMapper: {
    '^@libs/common(|/.*)$': '<rootDir>/libs/common/src/$1',
    '^@libs/entities(|/.*)$': '<rootDir>/libs/entities/src/$1',
    '^@libs/database(|/.*)$': '<rootDir>/libs/database/src/$1',
    '^@libs/services(|/.*)$': '<rootDir>/libs/services/src/$1',
  },
};

