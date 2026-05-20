// Node.js process-level error logger
// Usage: require this at the top of your test runner or entrypoint
const fs = require('fs');
const path = require('path');

function logError(type, err) {
  const logPath = path.resolve(__dirname, '../node-process-errors.log');
  const msg = `[${new Date().toISOString()}] [${type}] ${err && err.stack ? err.stack : String(err)}\n`;
  try {
    fs.appendFileSync(logPath, msg);
  } catch (e) {
    // Fallback: print to stderr
    console.error('Failed to write error log:', e);
    console.error(msg);
  }
}

process.on('uncaughtException', err => {
  logError('uncaughtException', err);
  process.exit(1);
});

process.on('unhandledRejection', err => {
  logError('unhandledRejection', err);
  process.exit(1);
});

// Optional: log warnings
process.on('warning', warning => {
  logError('warning', warning);
});
