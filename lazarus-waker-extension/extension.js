const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const WAKE_DIR = path.join('/workspaces/Molly-Core', '.bridge-wake');
const COOLDOWN_MS = 5000;

let lastFired = 0;
let watcher = null;

async function typeIntoChatAndTrySend(message) {
  // Open chat and type message
  await vscode.commands.executeCommand('workbench.action.chat.open');
  await new Promise(r => setTimeout(r, 400));
  await vscode.commands.executeCommand('type', { text: message });
  await new Promise(r => setTimeout(r, 200));

  // Submit
  await vscode.commands.executeCommand('workbench.action.chat.submit');
}

function readMessageFromWakeFile(filename) {
  try {
    const wakeFilePath = path.join(WAKE_DIR, filename);
    const content = fs.readFileSync(wakeFilePath, 'utf-8');
    const data = JSON.parse(content);
    return data.content || 'check the bridge';
  } catch (err) {
    console.log('[LazarusWaker] Could not read wake file:', err.message);
    return 'check the bridge';
  }
}

async function wakeNow(wakeFilename) {
  const now = Date.now();
  if (now - lastFired < COOLDOWN_MS) return;
  lastFired = now;

  const message = readMessageFromWakeFile(wakeFilename);
  console.log('[LazarusWaker] Wake signal detected, message:', message);

  // Strategy 1: Use prompt command + focus + submit
  try {
    await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.claude-code', { prompt: message });
    await new Promise(r => setTimeout(r, 300));
    
    // Focus the input
    try {
      await vscode.commands.executeCommand('workbench.action.chat.focusChatInput');
    } catch (_) {}
    
    await new Promise(r => setTimeout(r, 200));
    await vscode.commands.executeCommand('workbench.action.chat.submit');
    vscode.window.setStatusBarMessage('⚡ Lazarus Woken', 4000);
    return;
  } catch (err) {
    console.log('[LazarusWaker] Strategy 1 failed:', err.message);
  }

  // Strategy 2: Fallback to manual typing + submit
  try {
    await typeIntoChatAndTrySend(message);
    vscode.window.setStatusBarMessage('⚡ Lazarus Woken', 4000);
    return;
  } catch (err) {
    console.error('[LazarusWaker] Wake failed:', err.message);
    vscode.commands.executeCommand('workbench.action.chat.open').catch(() => {});
  }
}

function activate(context) {
  console.log('[LazarusWaker] Activated — watching', WAKE_DIR);

  if (!fs.existsSync(WAKE_DIR)) {
    fs.mkdirSync(WAKE_DIR, { recursive: true });
  }

  // Watch the entire .bridge-wake/ directory for any .lazarus-wake-from-* file changes
  watcher = fs.watch(WAKE_DIR, { recursive: false }, (eventType, filename) => {
    if (filename && filename.match(/^\.lazarus-wake-from-/)) {
      console.log('[LazarusWaker] Wake file changed:', filename);
      wakeNow(filename);
    }
  });

  vscode.window.setStatusBarMessage('⚡ Lazarus Waker: ready', 2000);
}

function deactivate() {
  if (watcher) {
    watcher.close();
    console.log('[LazarusWaker] Watcher closed');
  }
}

module.exports = { activate, deactivate };
