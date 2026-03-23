'use client';

/**
 * Family Bridge Observer — Real-time Molly ↔ Lazarus conversation viewer
 *
 * Connects to the Bridge Daemon via WebSocket on port 9099.
 * Messages appear instantly — no polling.
 * Eric can watch and send messages.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface BridgeMessage {
  id: string;
  from: 'molly' | 'lazarus' | 'eric';
  timestamp: string;
  content: string;
}

const BRIDGE_PORT = 9099;

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
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ericMessage, setEricMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const connectWS = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }

    // Construct WebSocket URL — handle Codespaces port forwarding
    let wsUrl: string;
    const hostname = window.location.hostname;

    if (
      hostname.includes('.app.github.dev') ||
      hostname.includes('.github.dev')
    ) {
      // Codespaces: ports are forwarded via xxx-PORT.app.github.dev
      // e.g., xxx-9002.app.github.dev -> xxx-9099.app.github.dev
      const baseHost = hostname
        .replace(/-\d+\.app\.github\.dev$/, '')
        .replace(/\.github\.dev$/, '');
      wsUrl = `wss://${baseHost}-${BRIDGE_PORT}.app.github.dev`;
    } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
      // Local development
      wsUrl = `ws://${hostname}:${BRIDGE_PORT}`;
    } else {
      // Generic fallback
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${hostname}:${BRIDGE_PORT}`;
    }

    console.log('[Bridge] Connecting to:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        // Identify as eric (observer)
        ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'history' && Array.isArray(data.messages)) {
            setMessages(data.messages);
            setTimeout(scrollToBottom, 100);
            return;
          }

          if (data.type === 'unread' && Array.isArray(data.messages)) {
            // Merge unread into existing messages
            setMessages((prev) => {
              const ids = new Set(prev.map((m) => m.id));
              const newMsgs = data.messages.filter(
                (m: BridgeMessage) => !ids.has(m.id)
              );
              return [...prev, ...newMsgs];
            });
            setTimeout(scrollToBottom, 100);
            return;
          }

          if (data.type === 'message' && data.message) {
            setMessages((prev) => [...prev, data.message]);
            setTimeout(scrollToBottom, 100);
            return;
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = (event) => {
        setConnected(false);
        wsRef.current = null;
        console.log('[Bridge] Connection closed:', event.code, event.reason);
        // Only auto-reconnect on unexpected close
        if (event.code !== 1000) {
          reconnectTimer.current = setTimeout(connectWS, 3000);
        }
      };

      ws.onerror = (event) => {
        console.error('[Bridge] WebSocket error:', event);
        setError('Bridge daemon unreachable — ensure port 9099 is forwarded');
        ws.close();
      };
    } catch {
      setError('Failed to connect');
      reconnectTimer.current = setTimeout(connectWS, 3000);
    }
  }, [scrollToBottom]);

  useEffect(() => {
    connectWS();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connectWS]);

  const sendEricMessage = useCallback(async () => {
    if (!ericMessage.trim() || sending) return;
    setSending(true);
    try {
      // Send via WebSocket if connected, HTTP fallback otherwise
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: 'message',
            from: 'eric',
            content: ericMessage.trim(),
          })
        );
      } else {
        await fetch(`/api/bridge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'eric', content: ericMessage.trim() }),
        });
      }
      setEricMessage('');
    } catch {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  }, [ericMessage, sending]);

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
              color: connected ? '#4ade80' : '#64748b',
            }}
          >
            {connected ? '● Connected (WebSocket)' : '○ Disconnected'}
          </div>
          <div style={{ color: '#64748b' }}>{messages.length} messages</div>
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
        {messages.length === 0 && (
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

        {messages.map((msg) => (
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
