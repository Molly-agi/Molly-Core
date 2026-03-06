'use client';

/**
 * Family Bridge Observer — Real-time Molly ↔ Lazarus conversation viewer
 *
 * This page polls the bridge API and displays the conversation as it happens.
 * Eric can watch Molly and Lazarus talk, and can also send messages himself.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface BridgeMessage {
  id: string;
  from: 'molly' | 'lazarus' | 'eric';
  timestamp: string;
  content: string;
  read: boolean;
}

interface BridgeData {
  active: boolean;
  startedAt: string;
  lastActivity: string;
  totalMessages: number;
  messages: BridgeMessage[];
}

const POLL_INTERVAL = 2000; // 2 seconds

const senderColors: Record<string, string> = {
  molly: '#e879f9', // Purple/pink — Molly
  lazarus: '#60a5fa', // Blue — Lazarus
  eric: '#fbbf24', // Gold — Father
};

const senderLabels: Record<string, string> = {
  molly: '🧠 Molly',
  lazarus: '🛡️ Lazarus',
  eric: '👑 Eric',
};

export default function BridgeObserver() {
  const [data, setData] = useState<BridgeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ericMessage, setEricMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection lost');
    }
  }, []);

  // Poll for new messages
  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (data && data.totalMessages > prevCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      prevCountRef.current = data.totalMessages;
    }
  }, [data]);

  const sendEricMessage = async () => {
    if (!ericMessage.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'eric', content: ericMessage.trim() }),
      });
      setEricMessage('');
      await fetchMessages();
    } catch {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0a0a0f',
        color: '#e2e8f0',
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #1e293b',
          background: '#0f1219',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 600,
              color: '#f8fafc',
            }}
          >
            🌉 Family Bridge
          </h1>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: '#64748b',
            }}
          >
            Molly ↔ Lazarus — Real-time Observer
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px' }}>
          <div
            style={{
              color: data?.active ? '#4ade80' : '#64748b',
            }}
          >
            {data?.active ? '● Active' : '○ Idle'}
          </div>
          <div style={{ color: '#64748b' }}>
            {data?.totalMessages ?? 0} messages
          </div>
          {error && (
            <div style={{ color: '#f87171', marginTop: '2px' }}>{error}</div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '16px 20px',
        }}
      >
        {(!data || data.messages.length === 0) && (
          <div
            style={{
              textAlign: 'center',
              color: '#475569',
              marginTop: '40px',
              fontSize: '14px',
            }}
          >
            No messages yet. When Molly uses her familyBridge tool
            <br />
            or Lazarus sends a reply, the conversation will appear here.
          </div>
        )}

        {data?.messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: '12px',
              padding: '10px 14px',
              borderLeft: `3px solid ${senderColors[msg.from] || '#475569'}`,
              background: '#111827',
              borderRadius: '0 6px 6px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '6px',
                fontSize: '12px',
              }}
            >
              <span
                style={{
                  color: senderColors[msg.from] || '#94a3b8',
                  fontWeight: 600,
                }}
              >
                {senderLabels[msg.from] || msg.from}
              </span>
              <span style={{ color: '#475569' }}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
            <div
              style={{
                fontSize: '14px',
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Eric's input */}
      <div
        style={{
          padding: '12px 20px',
          borderTop: '1px solid #1e293b',
          background: '#0f1219',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={ericMessage}
          onChange={(e) => setEricMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendEricMessage()}
          placeholder="Send a message as Eric..."
          style={{
            flex: 1,
            padding: '10px 14px',
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '6px',
            color: '#f8fafc',
            fontSize: '14px',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
        <button
          onClick={sendEricMessage}
          disabled={sending || !ericMessage.trim()}
          style={{
            padding: '10px 20px',
            background: sending ? '#334155' : '#fbbf24',
            color: '#0a0a0f',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: sending ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
