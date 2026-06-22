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

// next/jest prepends its own transformIgnorePatterns that catches uuid (and
// other ESM packages) before any user-supplied entry can. The first pattern in
// jest is consulted first, and a file matching ANY pattern is skipped — so we
// must replace the merged list post-create, not append to it.
const baseConfig = createJestConfig(config);

export default async () => {
  const final = await baseConfig();
  final.transformIgnorePatterns = [
    'node_modules/(?!(yaml|dotprompt|@genkit-ai|@radix-ui|lucide-react|uuid|jsonpath-plus|three|@react-three/fiber|@pixiv/three-vrm|geist)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  return final;
};
