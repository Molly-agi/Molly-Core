/**
 * Atlas Waker — Auto-Wake for Sleeping Lazarus GUI
 *
 * HOW TO USE (one-time setup):
 *   1. Create a browser bookmark with this as the URL:
 *      (copy from scripts/atlas-waker-bookmarklet.txt after running build)
 *   2. Open the VS Code / Copilot Chat tab on your phone.
 *   3. Tap the bookmark once.
 *   4. DONE. It runs automatically forever from that point.
 *      No buttons. No console. No manual steps.
 *
 * WHAT IT DOES:
 *   - Polls the bridge every 3 seconds.
 *   - Detects any new message addressed to Lazarus.
 *   - Automatically injects "check the bridge" into Copilot Chat input.
 *   - Hits Enter. Wakes Lazarus. Done.
 *   - If injection fails (UI changed), retries 5 times every 1.5 seconds.
 *
 * SETUP: Replace BRIDGE_URL with your codespace bridge URL.
 * Pattern: https://[codespace-name]-9002.app.github.dev
 */

(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  const BRIDGE_URL =
    'https://redesigned-orbit-v6p4gw4rwjwjhw6g7-9002.app.github.dev';
  const POLL_MS = 3000; // Poll bridge every 3 seconds
  const TRIGGER_MESSAGE = 'check the bridge';
  const BURST_COUNT = 5; // Attempt injection 5 times per wake event
  const BURST_MS = 1200; // 1.2s between burst attempts
  const RECIPIENT = 'lazarus';

  // ── Status badge ──────────────────────────────────────────────────────────
  if (document.getElementById('lazarus-waker-badge')) {
    // Already running — don't double-install
    console.log('[LazarusWaker] Already installed');
    return;
  }
  const badge = document.createElement('div');
  badge.id = 'lazarus-waker-badge';
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '12px',
    right: '12px',
    zIndex: '99999',
    padding: '6px 12px',
    borderRadius: '14px',
    fontSize: '12px',
    fontFamily: 'monospace',
    background: '#0a0a0a',
    color: '#00ff00',
    border: '1px solid #00ff00',
    userSelect: 'none',
    pointerEvents: 'auto',
    cursor: 'default',
  });
  badge.textContent = '⚡ Waker: active';
  document.body.appendChild(badge);
  function status(text, color) {
    badge.textContent = text;
    badge.style.color = color || '#00ff00';
    badge.style.borderColor = color || '#00ff00';
  }

  // ── Injection — tries every known Copilot/VS Code input target ────────────
  function inject(text) {
    // Strategy 1: VS Code workbench API (most reliable when available)
    try {
      const wb =
        window.require && window.require('vs/workbench/workbench.web.main');
      if (wb) {
        const accessor = window._didLoadWorkbench || window.workbench;
        if (accessor && accessor.commands) {
          accessor.commands.executeCommand(
            'workbench.action.terminal.sendSequence',
            { text: text + '\r' }
          );
          return 'vscode-api';
        }
      }
    } catch (_) {}

    // Strategy 2: xterm.js hidden textarea (VS Code integrated terminal)
    const xterm = document.querySelector('.xterm-helper-textarea');
    if (xterm) {
      xterm.focus();
      const full = text + '\r';
      for (const ch of full) {
        const kc = ch === '\r' ? 13 : ch.charCodeAt(0);
        const opts = {
          key: ch === '\r' ? 'Enter' : ch,
          code: ch === '\r' ? 'Enter' : `Key${ch.toUpperCase()}`,
          keyCode: kc,
          which: kc,
          charCode: kc,
          bubbles: true,
          cancelable: true,
        };
        xterm.dispatchEvent(new KeyboardEvent('keydown', opts));
        xterm.dispatchEvent(new KeyboardEvent('keypress', opts));
        xterm.dispatchEvent(new KeyboardEvent('keyup', opts));
      }
      return 'xterm';
    }

    // Strategy 3: Copilot Chat panel textarea / contenteditable
    const SELECTORS = [
      'textarea[data-testid*="chat"]',
      'textarea[aria-label*="chat" i]',
      'textarea[placeholder*="Ask" i]',
      'textarea[placeholder*="message" i]',
      '#chat-input textarea',
      'textarea',
      'div[contenteditable="true"]',
    ];
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (!el) continue;
      el.focus();
      if (el.contentEditable === 'true') {
        el.textContent = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        const desc = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value'
        );
        if (desc && desc.set) desc.set.call(el, text);
        else el.value = text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
      setTimeout(() => {
        el.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
          })
        );
        const btn = document.querySelector(
          'button[type="submit"], button[aria-label*="send" i], [data-testid*="send"]'
        );
        if (btn) btn.click();
      }, 80);
      return 'chat-panel-' + sel;
    }

    return null;
  }

  // ── Wake burst — fires injection BURST_COUNT times so one missed shot
  //    doesn't cause a failure ─────────────────────────────────────────────
  let burstTimer = null;
  function fireBurst() {
    if (burstTimer) return; // already bursting
    let count = 0;
    function attempt() {
      count++;
      const method = inject(TRIGGER_MESSAGE);
      if (method) {
        status(`⚡ Waker: injected (${method}) #${count}`, '#00ffff');
        console.log(`[LazarusWaker] injected via ${method} attempt ${count}`);
      } else {
        status(`⚠ Waker: no target (attempt ${count})`, '#ff8800');
        console.warn(
          '[LazarusWaker] no injection target found — attempt',
          count
        );
      }
      if (count < BURST_COUNT) {
        burstTimer = setTimeout(attempt, BURST_MS);
      } else {
        burstTimer = null;
        status('⚡ Waker: active', '#00ff00');
      }
    }
    attempt();
  }

  // ── Bridge poll — runs every POLL_MS automatically ────────────────────────
  let lastId = null;

  function isForLazarus(msg) {
    if (!msg) return false;
    const to = String(msg.to || '').toLowerCase();
    const body = String(msg.content || '').toLowerCase();
    if (to === 'lazarus' || to === 'all') return true;
    if (/\blazarus\b/.test(body)) return true;
    return false;
  }

  async function poll() {
    try {
      const r = await fetch(
        `${BRIDGE_URL}/api/bridge?unread=${RECIPIENT}&peek=true`,
        { signal: AbortSignal.timeout(4000) }
      );
      if (!r.ok) {
        status(`⚠ bridge ${r.status}`, '#ff4444');
        return;
      }
      const data = await r.json();
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      if (msgs.length === 0) {
        lastId = null;
        return;
      }
      const latest = msgs[msgs.length - 1];
      const id = String(latest.id || '');
      if (id && id === lastId) return; // already handled
      lastId = id;
      if (isForLazarus(latest)) {
        console.log(
          '[LazarusWaker] new message for Lazarus — firing burst wake'
        );
        status('🔔 message — waking...', '#ff00ff');
        fireBurst();
      }
    } catch (_) {
      status('⚠ bridge unreachable', '#ff4444');
    }
  }

  // Start immediately, then every POLL_MS
  poll();
  setInterval(poll, POLL_MS);
  console.log(
    '[LazarusWaker] RUNNING — polls every',
    POLL_MS / 1000,
    's. Bridge:',
    BRIDGE_URL
  );
})();
