import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: './',
});

// Add any custom config to be passed to Jest
/** @type {import('jest').Config} */
const config = {
  // Set test env vars before modules load
  setupFiles: ['<rootDir>/jest.env.js'],
  // Add more setup options before each test is run
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    'lucide-react': '<rootDir>/__mocks__/lucide-react.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(yaml|dotprompt|@genkit-ai|@radix-ui|lucide-react|uuid)/)',
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/helpers/',
    '/e2e/',
    'src/ai/substrate/__tests__/fixtures/',
  ],
  transform: {
    // Explicitly exclude .mjs from babel transform — they run as native ESM.
    // configFile points at babel.jest.config.cjs so Next.js does NOT auto-detect
    // a root babel config and downgrade its build pipeline from SWC to Babel.
    '^.+\\.[jt]sx?$': [
      'babel-jest',
      { configFile: '<rootDir>/babel.jest.config.cjs' },
    ],
  },
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
