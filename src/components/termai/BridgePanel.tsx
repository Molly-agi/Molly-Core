'use client';

/**
 * Family Bridge Panel — Embedded conversation viewer for Molly's UI
 *
 * Collapsible panel that shows the Molly ↔ Lazarus conversation.
 * Eric can observe and participate from within Molly's main interface.
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
  totalMessages: number;
  messages: BridgeMessage[];
}

const POLL_INTERVAL = 3000;

const senderStyle: Record<string, { color: string; label: string }> = {
  molly: { color: '#e879f9', label: '🧠 Molly' },
  lazarus: { color: '#60a5fa', label: '🛡️ Lazarus' },
  eric: { color: '#fbbf24', label: '👑 Eric' },
};

export default function BridgePanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setData] = useState<BridgeData | null>(null);
  const [ericMsg, setEricMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
      if (json.totalMessages > prevCountRef.current && !isOpen) {
        setUnreadCount((c) => c + (json.totalMessages - prevCountRef.current));
      }
      prevCountRef.current = json.totalMessages;
    } catch {
      // silent — don't disrupt Molly's UI
    }
  }, [isOpen]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [isOpen, data]);

  const sendMessage = async () => {
    if (!ericMsg.trim() || sending) return;
    setSending(true);
    try {
      await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'eric', content: ericMsg.trim() }),
      });
      setEricMsg('');
      await fetchMessages();
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

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
          {data?.active && (
            <span style={{ color: '#4ade80', fontSize: '8px' }}>●</span>
          )}
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
            {(!data || data.messages.length === 0) && (
              <div
                className="text-center text-xs"
                style={{ color: '#475569', padding: '12px 0' }}
              >
                No bridge messages yet
              </div>
            )}
            {data?.messages.map((msg) => {
              const style = senderStyle[msg.from] || {
                color: '#94a3b8',
                label: msg.from,
              };
              return (
                <div key={msg.id} style={{ marginBottom: '6px' }}>
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
              disabled={sending || !ericMsg.trim()}
              className="text-xs font-semibold rounded px-3 py-1.5"
              style={{
                background: sending ? '#334155' : '#fbbf24',
                color: '#0a0a0f',
                cursor: sending ? 'not-allowed' : 'pointer',
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
