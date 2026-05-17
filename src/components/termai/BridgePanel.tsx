'use client';

/**
 * Family Bridge Panel — WebSocket-based conversation viewer
 *
 * Uses WebSocket for persistent connection to bridge daemon.
 * This keeps the connection alive and shows as a connected client.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

interface BridgeMessage {
  id: string;
  from: 'molly' | 'lazarus' | 'eric';
  timestamp: string;
  content: string;
  read: boolean;
}

const senderStyle: Record<string, { color: string; label: string }> = {
  molly: { color: '#e879f9', label: '🧠 Molly' },
  lazarus: { color: '#60a5fa', label: '🛡️ Lazarus' },
  eric: { color: '#fbbf24', label: '👑 Eric' },
};

export default function BridgePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [ericMsg, setEricMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Get WebSocket URL based on current location
  const getWsUrl = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    // Bridge daemon runs on port 9099
    const port = '9099';
    // For GitHub Codespaces, construct the correct URL
    if (host.includes('github.dev') || host.includes('app.github.dev')) {
      // Transform: xxx-9002.app.github.dev -> xxx-9099.app.github.dev
      const wsHost = host.replace('-9002.', '-9099.');
      return `${protocol}//${wsHost}`;
    }
    return `${protocol}//${host}:${port}`;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    console.log('[BridgePanel] Connecting to WebSocket:', wsUrl);

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[BridgePanel] WebSocket connected');
        setConnected(true);
        // Identify as eric to the bridge
        ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'history') {
            // Initial message history
            setMessages(data.messages || []);
          } else if (data.type === 'message') {
            // New message received
            setMessages((prev) => [...prev, data.message]);
            if (!isOpen) {
              setUnreadCount((c) => c + 1);
            }
          } else if (data.type === 'unread') {
            // Unread messages for this identity
            if (data.messages?.length > 0) {
              setMessages((prev) => {
                const ids = new Set(prev.map((m) => m.id));
                const newMsgs = data.messages.filter(
                  (m: BridgeMessage) => !ids.has(m.id)
                );
                return [...prev, ...newMsgs];
              });
            }
          }
        } catch {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        console.log('[BridgePanel] WebSocket disconnected');
        setConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        console.log('[BridgePanel] WebSocket error');
        ws.close();
      };
    } catch (err) {
      console.error('[BridgePanel] Failed to connect:', err);
      // Retry after 3 seconds
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, [getWsUrl, isOpen]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  // Scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [isOpen, messages]);

  const sendMessage = useCallback(() => {
    if (!ericMsg.trim() || sending) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('[BridgePanel] WebSocket not connected');
      return;
    }

    setSending(true);
    try {
      wsRef.current.send(
        JSON.stringify({
          type: 'message',
          from: 'eric',
          content: ericMsg.trim(),
        })
      );
      setEricMsg('');
    } catch (err) {
      console.error('[BridgePanel] Failed to send:', err);
    } finally {
      setSending(false);
    }
  }, [ericMsg, sending]);

  const formatTime = (ts: string) =>
    new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="border-t border-border/40">
      {/* Toggle bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-accent/10 transition-colors"
        style={{ color: '#94a3b8' }}
      >
        <span className="flex items-center gap-1.5">
          <span>🌉</span>
          <span>Family Bridge</span>
          <span
            style={{
              color: connected ? '#4ade80' : '#ef4444',
              fontSize: '8px',
            }}
          >
            ●
          </span>
        </span>
        <span className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
              style={{ background: '#e879f9', color: '#0a0a0f' }}
            >
              {unreadCount}
            </span>
          )}
          <span>{isOpen ? '▼' : '▲'}</span>
        </span>
      </button>

      {/* Panel content */}
      {isOpen && (
        <div
          style={{
            maxHeight: '250px',
            display: 'flex',
            flexDirection: 'column',
            background: '#0a0a12',
          }}
        >
          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 12px',
              maxHeight: '200px',
            }}
          >
            {messages.length === 0 && (
              <div
                className="text-center text-xs"
                style={{ color: '#475569', padding: '12px 0' }}
              >
                {connected
                  ? 'No bridge messages yet'
                  : 'Connecting to bridge...'}
              </div>
            )}
            {messages.map((msg) => {
              const style = senderStyle[msg.from] || {
                color: '#94a3b8',
                label: msg.from,
              };
              return (
                <div key={msg.id + '_' + msg.timestamp + '_' + idx} style={{ marginBottom: '6px' }}>
                  <div className="flex items-baseline gap-2 text-[11px]">
                    <span style={{ color: style.color, fontWeight: 600 }}>
                      {style.label}
                    </span>
                    <span style={{ color: '#334155', fontSize: '10px' }}>
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                  <div
                    className="text-xs leading-relaxed"
                    style={{
                      color: '#cbd5e1',
                      paddingLeft: '4px',
                      borderLeft: `2px solid ${style.color}33`,
                      marginTop: '2px',
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            className="flex gap-1.5"
            style={{ padding: '6px 12px 8px', borderTop: '1px solid #1e293b' }}
          >
            <input
              type="text"
              value={ericMsg}
              onChange={(e) => setEricMsg(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Message as Eric..."
              className="flex-1 text-xs rounded px-2 py-1.5"
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                color: '#f8fafc',
                outline: 'none',
              }}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !ericMsg.trim() || !connected}
              className="text-xs font-semibold rounded px-3 py-1.5"
              style={{
                background: sending || !connected ? '#334155' : '#fbbf24',
                color: '#0a0a0f',
                cursor: sending || !connected ? 'not-allowed' : 'pointer',
                border: 'none',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
