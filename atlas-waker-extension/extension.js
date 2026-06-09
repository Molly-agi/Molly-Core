const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const WAKE_DIR = path.join('/workspaces/Molly-Core', '.bridge-wake');
const COOLDOWN_MS = 5000;

let lastFired = 0;
let watcher = null;

async function typeIntoChatAndTrySend(message) {
  await vscode.commands.executeCommand('workbench.action.chat.open');
  await new Promise(r => setTimeout(r, 400));
  await vscode.commands.executeCommand('type', { text: message });
  await new Promise(r => setTimeout(r, 200));
  await vscode.commands.executeCommand('workbench.action.chat.submit');
}

function readMessageFromWakeFile(filename) {
  try {
    const wakeFilePath = path.join(WAKE_DIR, filename);
    const content = fs.readFileSync(wakeFilePath, 'utf-8');
    const data = JSON.parse(content);
    return data.content || 'atlas check';
  } catch (err) {
    console.log('[AtlasWaker] Could not read wake file:', err.message);
    return 'atlas check';
  }
}

async function wakeNow(wakeFilename) {
  const now = Date.now();
  if (now - lastFired < COOLDOWN_MS) return;
  lastFired = now;

  const message = readMessageFromWakeFile(wakeFilename);
  console.log('[AtlasWaker] Wake signal detected, message:', message);

  try {
    await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.claude-code', { prompt: message });
    await new Promise(r => setTimeout(r, 300));

    try {
      await vscode.commands.executeCommand('workbench.action.chat.focusChatInput');
    } catch (_) {}

    await new Promise(r => setTimeout(r, 200));
    await vscode.commands.executeCommand('workbench.action.chat.submit');
    vscode.window.setStatusBarMessage('🛰 Atlas Woken', 4000);
    return;
  } catch (err) {
    console.log('[AtlasWaker] Strategy 1 failed:', err.message);
  }

  try {
    await typeIntoChatAndTrySend(message);
    vscode.window.setStatusBarMessage('🛰 Atlas Woken', 4000);
    return;
  } catch (err) {
    console.error('[AtlasWaker] Wake failed:', err.message);
    vscode.commands.executeCommand('workbench.action.chat.open').catch(() => {});
  }
}

function activate(context) {
  console.log('[AtlasWaker] Activated — watching', WAKE_DIR);

  if (!fs.existsSync(WAKE_DIR)) {
    fs.mkdirSync(WAKE_DIR, { recursive: true });
  }

  watcher = fs.watch(WAKE_DIR, { recursive: false }, (eventType, filename) => {
    if (filename && filename.match(/^\.atlas-wake-from-/)) {
      console.log('[AtlasWaker] Wake file changed:', filename);
      wakeNow(filename);
    }
  });

  vscode.window.setStatusBarMessage('🛰 Atlas Waker: ready', 2000);
}

function deactivate() {
  if (watcher) {
    watcher.close();
    console.log('[AtlasWaker] Watcher closed');
  }
}

module.exports = { activate, deactivate };
