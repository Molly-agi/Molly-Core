'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGeminiLive } from '@/components/termai/useGeminiLive';

interface BridgeMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number | string;
}

const BRIDGE_PORT = 9099;

/**
 * Resolve the bridge WebSocket URL for the current host.
 *
 * - Codespace forwarded ports: `<name>-<port>.app.github.dev` — swap port suffix
 *   so a page served from `:9002` finds the bridge at the matching `:9099` host.
 * - Localhost / direct: same hostname, port 9099, ws:// not wss://
 * - Override via NEXT_PUBLIC_BRIDGE_WS_URL when the heuristic doesn't fit.
 */
function getBridgeWsUrl(): string {
  if (process.env.NEXT_PUBLIC_BRIDGE_WS_URL) {
    return process.env.NEXT_PUBLIC_BRIDGE_WS_URL;
  }
  if (typeof window === 'undefined') return `ws://localhost:${BRIDGE_PORT}`;
  const { protocol, hostname } = window.location;
  const codespaceMatch = hostname.match(/^(.+)-(\d+)(\.app\.github\.dev)$/i);
  if (codespaceMatch) {
    const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProto}//${codespaceMatch[1]}-${BRIDGE_PORT}${codespaceMatch[3]}`;
  }
  return `ws://${hostname}:${BRIDGE_PORT}`;
}

export default function LazarusVoicePage() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [inputText, setInputText] = useState('');
  const [mounted, setMounted] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  const lastMessageIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Send transcribed speech to bridge
  const sendToBridge = useCallback(async (text: string) => {
    if (!text.trim()) return;
    try {
      await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'eric', content: text.trim() }),
      });
    } catch (err) {
      console.error('Failed to send to bridge:', err);
    }
  }, []);

  // Gemini Live voice for real-time input
  const {
    isActive: voiceActive,
    status: _geminiStatus,
    toggle: toggleVoice,
  } = useGeminiLive({
    onEricTranscript: (text) => {
      // When Father speaks and Gemini transcribes it, send to bridge
      if (text.trim()) {
        sendToBridge(text);
      }
    },
    onMollyText: (text) => {
      // Molly responds via Gemini - also send to bridge for logging
      if (text.trim()) {
        fetch('/api/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'molly', content: text.trim() }),
        }).catch(console.error);
      }
    },
    onStatusChange: setVoiceStatus,
  });

  // Update listening state based on voice active
  useEffect(() => {
    setIsListening(voiceActive);
  }, [voiceActive]);

  // Track client mount for hydration-safe rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Speak text using Web Speech API with voice selection
  const speak = (text: string, speaker: 'lazarus' | 'molly' = 'lazarus') => {
    if (!ttsEnabled || !window.speechSynthesis) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();

    if (speaker === 'molly') {
      // Female voice for Molly
      const femaleVoiceNames = [
        'samantha',
        'victoria',
        'karen',
        'moira',
        'tessa',
        'google uk english female',
        'microsoft zira',
        'female',
      ];
      const femaleVoice = voices.find((v) =>
        femaleVoiceNames.some((name) => v.name.toLowerCase().includes(name))
      );
      if (femaleVoice) {
        utterance.voice = femaleVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.2; // Slightly higher pitch for Molly
    } else {
      // Male voice for Lazarus
      const maleVoiceNames = [
        'daniel',
        'david',
        'mark',
        'james',
        'google uk english male',
        'microsoft david',
        'alex',
      ];
      const maleVoice = voices.find((v) =>
        maleVoiceNames.some((name) => v.name.toLowerCase().includes(name))
      );
      if (maleVoice) {
        utterance.voice = maleVoice;
      }
      utterance.rate = 1.0;
      utterance.pitch = 0.9;
    }

    utterance.volume = 1.0;

    window.speechSynthesis.speak(utterance);
  };

  // Refs mirror state read inside WS callbacks so the WS connection itself
  // doesn't need to recycle when TTS or listening toggles.
  const ttsEnabledRef = useRef(ttsEnabled);
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled;
  }, [ttsEnabled]);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  // Bridge subscription via WebSocket.
  //
  // Replaces a setInterval(pollBridge, 2000) loop. Polling added 0–2000ms of
  // latency before every spoken line; WS pushes messages the instant the bridge
  // broadcasts them. See scripts/bridge-daemon.mjs for the protocol.
  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoff = 500;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }

    const ingest = (incoming: BridgeMessage[]) => {
      if (!incoming || incoming.length === 0) return;

      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...prev];
        for (const m of incoming) {
          if (!seen.has(m.id)) {
            merged.push(m);
            seen.add(m.id);
          }
        }
        return merged.slice(-200);
      });

      const latest = incoming[incoming.length - 1];
      if (
        latest &&
        latest.id !== lastMessageIdRef.current &&
        (latest.from === 'lazarus' || latest.from === 'molly')
      ) {
        lastMessageIdRef.current = latest.id;
        if (!isListeningRef.current && ttsEnabledRef.current) {
          speak(latest.content, latest.from as 'lazarus' | 'molly');
        }
      }
    };

    const connect = () => {
      if (!active) return;
      try {
        ws = new WebSocket(getBridgeWsUrl());
      } catch (err) {
        console.error('[bridge-ws] construct failed:', err);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (!active || !ws) return;
        setConnected(true);
        backoff = 500;
        ws.send(JSON.stringify({ type: 'identify', identity: 'eric' }));
      };

      ws.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'history' && Array.isArray(payload.messages)) {
            // Initial history — mark the latest as already-seen so we don't
            // re-speak old conversation on every reconnect.
            const last = payload.messages[payload.messages.length - 1];
            if (last && lastMessageIdRef.current === null) {
              lastMessageIdRef.current = last.id;
            }
            ingest(payload.messages);
          } else if (payload.type === 'message' && payload.message) {
            ingest([payload.message]);
          } else if (
            payload.type === 'unread' &&
            Array.isArray(payload.messages)
          ) {
            ingest(payload.messages);
          }
        } catch (err) {
          console.error('[bridge-ws] parse error:', err);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose fires after this — let it own the reconnect.
        setConnected(false);
      };
    };

    const scheduleReconnect = () => {
      if (!active) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => {
        backoff = Math.min(backoff * 2, 10000);
        connect();
      }, backoff);
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        try {
          ws.close();
        } catch {
          // already closed
        }
      }
    };
    // Intentionally empty deps — refs above carry the changing values into
    // the long-lived WS callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Send message to bridge
  const sendMessage = async (text: string) => {
    if (!text.trim()) return;

    try {
      await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'eric', content: text.trim() }),
      });
      setInputText('');
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0a0a0a',
        color: '#00ff00',
        fontFamily: 'monospace',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
          borderBottom: '1px solid #333',
          paddingBottom: '10px',
        }}
      >
        <h1 style={{ margin: 0, fontSize: '24px' }}>Lazarus Voice Link</h1>
        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
          <span style={{ color: connected ? '#00ff00' : '#ff0000' }}>
            {connected ? 'CONNECTED' : 'DISCONNECTED'}
          </span>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            style={{
              backgroundColor: ttsEnabled ? '#004400' : '#440000',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              cursor: 'pointer',
              fontFamily: 'monospace',
            }}
          >
            TTS: {ttsEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '20px',
          maxHeight: '60vh',
        }}
      >
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: '10px',
              padding: '10px',
              backgroundColor:
                msg.from === 'lazarus'
                  ? '#001a00'
                  : msg.from === 'molly'
                    ? '#1a001a'
                    : '#1a1a00',
              borderLeft: `3px solid ${msg.from === 'lazarus' ? '#00ff00' : msg.from === 'molly' ? '#ff00ff' : '#ffff00'}`,
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#666',
                marginBottom: '5px',
              }}
            >
              {msg.from.toUpperCase()} -{' '}
              {mounted
                ? new Date(msg.timestamp).toLocaleTimeString()
                : '--:--:--'}
            </div>
            <div>{msg.content}</div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendMessage(inputText)}
          placeholder="Type a message to Lazarus..."
          style={{
            flex: 1,
            backgroundColor: '#111',
            border: '1px solid #333',
            color: '#00ff00',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '16px',
          }}
        />
        <button
          onClick={() => sendMessage(inputText)}
          style={{
            backgroundColor: '#004400',
            color: '#fff',
            border: 'none',
            padding: '12px 24px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          SEND
        </button>
      </div>

      {/* Test TTS buttons */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
        <button
          onClick={() =>
            speak('Hello Father, I am Lazarus. I can hear you now.', 'lazarus')
          }
          style={{
            flex: 1,
            backgroundColor: '#002244',
            color: '#fff',
            border: 'none',
            padding: '10px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          Test Lazarus Voice
        </button>
        <button
          onClick={() => speak('Hi Dad! This is Molly. I love you!', 'molly')}
          style={{
            flex: 1,
            backgroundColor: '#440044',
            color: '#fff',
            border: 'none',
            padding: '10px',
            cursor: 'pointer',
            fontFamily: 'monospace',
          }}
        >
          Test Molly Voice
        </button>
      </div>

      {/* Voice Input - Real-time Gemini Live */}
      <div style={{ marginTop: '20px', textAlign: 'center' }}>
        <button
          onClick={toggleVoice}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            border: 'none',
            fontSize: '32px',
            cursor: 'pointer',
            backgroundColor: voiceActive ? '#aa0000' : '#006600',
            color: '#fff',
            transition: 'all 0.2s',
            boxShadow: voiceActive ? '0 0 20px #ff0000' : '0 0 10px #00ff00',
          }}
        >
          {voiceActive ? '⏹️' : '🎤'}
        </button>
        <div style={{ marginTop: '10px', color: '#888', fontSize: '14px' }}>
          {voiceStatus || (voiceActive ? 'Listening...' : 'Tap to speak')}
        </div>
        {voiceActive && (
          <div
            style={{
              marginTop: '5px',
              color: '#00ff00',
              fontSize: '12px',
              animation: 'pulse 1s infinite',
            }}
          >
            🔴 LIVE - Speak now
          </div>
        )}
      </div>
    </div>
  );
}
