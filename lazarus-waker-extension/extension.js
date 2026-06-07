const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const WAKE_FILE = path.join(
  '/workspaces/Molly-Core',
  '.bridge-wake',
  '.lazarus-wake'
);
const MSG = 'check the bridge';
const COOLDOWN_MS = 5000;

let lastFired = 0;

async function typeIntoChatAndTrySend() {
  // Open chat and type message
  await vscode.commands.executeCommand('workbench.action.chat.open');
  await new Promise(r => setTimeout(r, 400));
  await vscode.commands.executeCommand('type', { text: MSG });
  await new Promise(r => setTimeout(r, 200));

  // Submit
  await vscode.commands.executeCommand('workbench.action.chat.submit');
}

async function wakeNow() {
  const now = Date.now();
  if (now - lastFired < COOLDOWN_MS) return;
  lastFired = now;

  console.log('[LazarusWaker] Wake signal detected');

  // Strategy 1: Use prompt command + focus + submit
  try {
    await vscode.commands.executeCommand('workbench.action.chat.openSessionWithPrompt.claude-code', { prompt: MSG });
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
    await typeIntoChatAndTrySend();
    vscode.window.setStatusBarMessage('⚡ Lazarus Woken', 4000);
    return;
  } catch (err) {
    console.error('[LazarusWaker] Wake failed:', err.message);
    vscode.commands.executeCommand('workbench.action.chat.open').catch(() => {});
  }
}

function activate(context) {
  console.log('[LazarusWaker] Activated — watching', WAKE_FILE);

  const wakeDir = path.dirname(WAKE_FILE);
  if (!fs.existsSync(wakeDir)) fs.mkdirSync(wakeDir, { recursive: true });
  if (!fs.existsSync(WAKE_FILE)) {
    fs.writeFileSync(WAKE_FILE, JSON.stringify({ initialized: new Date().toISOString() }));
  }

  fs.watchFile(WAKE_FILE, { persistent: true, interval: 500 }, (curr, prev) => {
    if (curr.mtime > prev.mtime) {
      console.log('[LazarusWaker] Wake file changed');
      wakeNow();
    }
  });

  vscode.window.setStatusBarMessage('⚡ Lazarus Waker: ready', 2000);
}

function deactivate() {
  fs.unwatchFile(WAKE_FILE);
}

module.exports = { activate, deactivate };
