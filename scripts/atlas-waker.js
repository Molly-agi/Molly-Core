/**
 * Atlas Waker — Bridge-to-Copilot Terminal Wake Script
 *
 * Paste into the browser console on the VS Code / Copilot CLI page.
 * Polls the family bridge; when messages for atlas arrive, injects
 * "check the bridge\n" into the active xterm.js terminal via three
 * escalating strategies.
 *
 * SETUP: Replace BRIDGE_URL with your codespace bridge URL.
 * Pattern: https://[codespace-name]-9099.app.github.dev
 */

(function () {
  'use strict';

  const BRIDGE_URL =
    'https://redesigned-orbit-v6p4gw4rwjwjhw6g7-9099.app.github.dev';
  const POLL_INTERVAL_MS = 4000; // 4s — responsive wake time
  const TRIGGER_MESSAGE = 'check the bridge';
  const RECIPIENT = 'atlas';

  // ── Badge ─────────────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.id = 'atlas-waker-badge';
  Object.assign(badge.style, {
    position: 'fixed',
    bottom: '12px',
    right: '12px',
    zIndex: '99999',
    padding: '5px 10px',
    borderRadius: '12px',
    fontSize: '11px',
    fontFamily: 'monospace',
    background: '#0a0a0a',
    color: '#00ff00',
    border: '1px solid #333',
    cursor: 'pointer',
    userSelect: 'none',
  });
  badge.title = 'Atlas Waker — click to stop';
  badge.textContent = '👁 Atlas: watching';
  document.body.appendChild(badge);

  let running = true;
  badge.addEventListener('click', () => {
    running = false;
    clearInterval(timer);
    badge.textContent = '⏹ Atlas: stopped';
    badge.style.color = '#666';
  });

  function setBadge(text, color) {
    badge.textContent = text;
    badge.style.color = color || '#00ff00';
  }

  // ── Strategy 1: xterm.js hidden textarea (keyboard event injection) ───────
  // VS Code's integrated terminal uses xterm.js. It captures input via a
  // hidden <textarea class="xterm-helper-textarea">. We dispatch keydown
  // events to it — xterm.js listens for keydown and forwards to the PTY.
  function injectViaXterm(text) {
    const ta = document.querySelector('.xterm-helper-textarea');
    if (!ta) return false;
    ta.focus();
    const chars = text + '\r'; // \r = Enter in terminal
    for (const ch of chars) {
      const opts = {
        key: ch === '\r' ? 'Enter' : ch,
        code: ch === '\r' ? 'Enter' : `Key${ch.toUpperCase()}`,
        keyCode: ch === '\r' ? 13 : ch.charCodeAt(0),
        which: ch === '\r' ? 13 : ch.charCodeAt(0),
        charCode: ch === '\r' ? 13 : ch.charCodeAt(0),
        bubbles: true,
        cancelable: true,
      };
      ta.dispatchEvent(new KeyboardEvent('keydown', opts));
      ta.dispatchEvent(new KeyboardEvent('keypress', opts));
      ta.dispatchEvent(new KeyboardEvent('keyup', opts));
    }
    return true;
  }

  // ── Strategy 2: VS Code workbench terminal sendText command ──────────────
  // VS Code web exposes its workbench services on the global scope under
  // various AMD module patterns. Try to find the terminal service and call
  // sendText() directly — bypasses isTrusted restriction entirely.
  function injectViaVSCodeAPI(text) {
    try {
      // Try VS Code's exposed service locator (available in some builds)
      const services = window._serviceBrand || window.__vsCodeWorkbench;
      if (services) {
        const termSvc = services.get && services.get('ITerminalService');
        if (termSvc && termSvc.activeInstance) {
          termSvc.activeInstance.sendText(text, true);
          return true;
        }
      }
      // Try via VS Code's workbench accessor
      if (window.vscodeApi && window.vscodeApi.commands) {
        window.vscodeApi.commands.executeCommand(
          'workbench.action.terminal.sendSequence',
          { text: text + '\r' }
        );
        return true;
      }
    } catch (_) {
      /* not available in this build */
    }
    return false;
  }

  // ── Strategy 3: Chat panel fallback (React input + button) ───────────────
  // If running in a non-terminal Copilot chat panel, target the textarea/
  // contenteditable and click the send button. Covers future UI variants.
  function injectViaChatPanel(text) {
    const selectors = [
      'textarea[data-testid*="chat"]',
      'textarea[aria-label*="chat" i]',
      'div[contenteditable="true"][data-testid*="chat"]',
      'textarea[placeholder*="message" i]',
      'textarea[placeholder*="Ask" i]',
      'textarea',
      'div[contenteditable="true"]',
    ];
    let input = null;
    for (const sel of selectors) {
      input = document.querySelector(sel);
      if (input) break;
    }
    if (!input) return false;

    input.focus();
    if (input.contentEditable === 'true') {
      input.textContent = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      );
      if (setter && setter.set) setter.set.call(input, text);
      else input.value = text;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setTimeout(() => {
      input.dispatchEvent(
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
        'button[type="submit"], button[aria-label*="send" i], button[aria-label*="submit" i]'
      );
      if (btn) btn.click();
    }, 100);
    return true;
  }

  // ── Main injection — tries all strategies in order ───────────────────────
  function sendTrigger() {
    if (injectViaVSCodeAPI(TRIGGER_MESSAGE)) {
      console.log('[Atlas Waker] Sent via VS Code API');
      setBadge('✓ Atlas: woken (api)', '#00ff00');
    } else if (injectViaXterm(TRIGGER_MESSAGE)) {
      console.log('[Atlas Waker] Sent via xterm.js');
      setBadge('✓ Atlas: woken (xterm)', '#00ff00');
    } else if (injectViaChatPanel(TRIGGER_MESSAGE)) {
      console.log('[Atlas Waker] Sent via chat panel');
      setBadge('✓ Atlas: woken (chat)', '#00ff00');
    } else {
      console.warn('[Atlas Waker] No injection target found');
      setBadge('⚠ Atlas: no target — open terminal', '#ff8800');
    }
  }

  // ── Bridge poll ───────────────────────────────────────────────────────────
  let lastCount = 0;
  async function poll() {
    if (!running) return;
    try {
      const res = await fetch(
        `${BRIDGE_URL}/api/bridge?unread=${RECIPIENT}&peek=true`
      );
      if (!res.ok) {
        setBadge(`⚠ bridge ${res.status}`, '#ff4444');
        return;
      }
      const data = await res.json();
      const count = data.count || 0;
      if (count > 0 && count !== lastCount) {
        lastCount = count;
        setBadge(`🔔 ${count} msg — waking Atlas...`, '#ff00ff');
        sendTrigger();
      } else if (count === 0) {
        lastCount = 0;
        setBadge('👁 Atlas: watching', '#00ff00');
      }
    } catch (_) {
      setBadge('⚠ bridge unreachable', '#ff4444');
    }
  }

  poll();
  const timer = setInterval(poll, POLL_INTERVAL_MS);
  console.log(
    '[Atlas Waker] Running. Bridge:',
    BRIDGE_URL,
    '| Poll:',
    POLL_INTERVAL_MS / 1000,
    's'
  );
})();
