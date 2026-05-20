/**
 * Jest environment setup - runs BEFORE test modules are loaded.
 * Use this for env vars that modules read at import time.
 */

// Rogue mode requires these phrases to be set
process.env.ROGUE_ACTIVATION_PHRASE = 'going dark';
process.env.ROGUE_DEACTIVATION_PHRASE = 'coming home';

// Note: Node.js 18+ has native fetch, Request, Response, Headers
// Jest-environment-jsdom should have these too
// No additional polyfills needed for modern Node.js
