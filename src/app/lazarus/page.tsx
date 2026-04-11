'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useGeminiLive } from '@/components/termai/useGeminiLive';

interface BridgeMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number | string;
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

  // Poll bridge via HTTP API
  useEffect(() => {
    let active = true;

    const pollBridge = async () => {
      try {
        const res = await fetch('/api/bridge?limit=30');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setConnected(true);

        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);

          // Speak new messages from Lazarus or Molly
          const latestMsg = data.messages[data.messages.length - 1];
          if (
            latestMsg.id !== lastMessageIdRef.current &&
            (latestMsg.from === 'lazarus' || latestMsg.from === 'molly')
          ) {
            lastMessageIdRef.current = latestMsg.id;
            if (!isListening) {
              speak(latestMsg.content, latestMsg.from as 'lazarus' | 'molly');
            }
          }
        }
      } catch {
        setConnected(false);
      }
    };

    // Load voices
    if (window.speechSynthesis) {
      window.speechSynthesis.getVoices();
    }

    pollBridge();
    const interval = setInterval(() => {
      if (active) pollBridge();
    }, 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speak changes with ttsEnabled which is already in deps
  }, [ttsEnabled, isListening]);

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
