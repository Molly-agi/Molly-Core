/**
 * Jest environment setup - runs BEFORE test modules are loaded.
 * Use this for env vars that modules read at import time.
 */

// Rogue mode requires these phrases to be set
process.env.ROGUE_ACTIVATION_PHRASE = 'going dark';
process.env.ROGUE_DEACTIVATION_PHRASE = 'coming home';
