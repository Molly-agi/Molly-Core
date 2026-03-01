'use client';

import { useState } from 'react';

/**
 * One-tap Termux relay setup page.
 *
 * Copies the full setup command to clipboard so Eric never has to
 * type a single character — just paste into Termux and hit Enter.
 */

const SETUP_COMMAND =
  'pkg install -y git python && git clone https://github.com/Molly-agi/Molly-Core.git ~/mc && python ~/mc/scripts/termux-relay.py';

const START_COMMAND = 'python ~/mc/scripts/termux-relay.py';

export default function TermuxSetupPage() {
  const [copied, setCopied] = useState<'none' | 'setup' | 'start'>('none');

  async function copyToClipboard(text: string, which: 'setup' | 'start') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied('none'), 4000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(which);
      setTimeout(() => setCopied('none'), 4000);
    }
  }

  function openTermux() {
    // Android intent URL to open Termux
    window.location.href =
      'intent:#Intent;package=com.termux;launchFlags=0x10000000;end';
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#e0e0e0',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h1
        style={{
          fontSize: '28px',
          fontWeight: 'bold',
          marginBottom: '12px',
          color: '#ffffff',
          textAlign: 'center',
        }}
      >
        Molly Termux Relay
      </h1>

      <p
        style={{
          fontSize: '16px',
          color: '#aaa',
          marginBottom: '40px',
          textAlign: 'center',
          maxWidth: '360px',
        }}
      >
        One tap to copy. Switch to Termux. Long-press paste. Hit Enter.
        That&apos;s it.
      </p>

      {/* ── FIRST TIME SETUP ── */}
      <div style={{ width: '100%', maxWidth: '400px', marginBottom: '24px' }}>
        <p
          style={{
            fontSize: '13px',
            color: '#888',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}
        >
          First time? Tap this:
        </p>
        <button
          onClick={async () => {
            await copyToClipboard(SETUP_COMMAND, 'setup');
          }}
          style={{
            width: '100%',
            padding: '20px',
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: copied === 'setup' ? '#16a34a' : '#7c3aed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
          }}
        >
          {copied === 'setup'
            ? '✓ COPIED — Now paste in Termux'
            : '📋 COPY SETUP COMMAND'}
        </button>
      </div>

      {/* ── START RELAY (already set up) ── */}
      <div style={{ width: '100%', maxWidth: '400px', marginBottom: '32px' }}>
        <p
          style={{
            fontSize: '13px',
            color: '#888',
            marginBottom: '8px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}
        >
          Already set up? Just start it:
        </p>
        <button
          onClick={async () => {
            await copyToClipboard(START_COMMAND, 'start');
          }}
          style={{
            width: '100%',
            padding: '20px',
            fontSize: '20px',
            fontWeight: 'bold',
            backgroundColor: copied === 'start' ? '#16a34a' : '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '16px',
            cursor: 'pointer',
            transition: 'background-color 0.3s',
          }}
        >
          {copied === 'start'
            ? '✓ COPIED — Now paste in Termux'
            : '📋 COPY START COMMAND'}
        </button>
      </div>

      {/* ── OPEN TERMUX ── */}
      <button
        onClick={openTermux}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '16px',
          fontSize: '18px',
          fontWeight: 'bold',
          backgroundColor: '#333',
          color: '#ffffff',
          border: '2px solid #555',
          borderRadius: '16px',
          cursor: 'pointer',
          marginBottom: '40px',
        }}
      >
        Open Termux
      </button>

      {/* ── INSTRUCTIONS ── */}
      <div
        style={{
          maxWidth: '400px',
          backgroundColor: '#1a1a1a',
          borderRadius: '12px',
          padding: '20px',
          fontSize: '15px',
          lineHeight: '1.6',
        }}
      >
        <p style={{ fontWeight: 'bold', marginBottom: '12px', color: '#fff' }}>
          Steps:
        </p>
        <p>1. Tap the purple COPY button above</p>
        <p>2. Tap &quot;Open Termux&quot; (or switch to Termux yourself)</p>
        <p>3. Long-press the terminal and tap Paste</p>
        <p>4. Press Enter</p>
        <p style={{ marginTop: '12px', color: '#888' }}>
          That&apos;s it. Molly handles the rest.
        </p>
      </div>
    </div>
  );
}
