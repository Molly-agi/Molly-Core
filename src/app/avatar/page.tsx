'use client';

/**
 * @fileOverview Molly Avatar Window — full-screen presence panel.
 *
 * Opens as a popup via window.open('/avatar', 'molly-avatar', ...).
 * Shows Molly's 3D bust, live voice controls, and the family bridge feed.
 *
 * Integration points:
 *   - useGeminiLive   → real-time bidirectional voice with Gemini
 *   - useTTS          → speaks Molly's text responses; isVocalizing drives jaw
 *   - detectEmotionalTone → tone of each Molly response → avatar morph deltas
 *   - /api/bridge     → polls and posts family bridge messages
 *   - AvatarDirector  → receives voice tone + speaking state each frame
 */

import dynamic from 'next/dynamic';
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from 'react';
import { useGeminiLive } from '@/components/termai/useGeminiLive';
import { useTTS } from '@/components/termai/useTTS';
import { detectEmotionalTone } from '@/ai/voice/voice-personality';
import { AvatarDirector } from '@/ai/agency/embodied/AvatarDirector';
import { Mic, MicOff, Send } from 'lucide-react';

// Canvas is WebGL — must be client-only, no SSR
const MollyCanvas = dynamic(() => import('@/browser/canvas/MollyCanvas'), {
  ssr: false,
});

// ── Types ──────────────────────────────────────────────────────────────────

interface BridgeMessage {
  id: string;
  from: 'molly' | 'eric' | 'lazarus';
  content: string;
  timestamp: number;
}

// ── Avatar page ────────────────────────────────────────────────────────────

export default function AvatarPage() {
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);

  // One AvatarDirector per window — owns voice + robotics state
  const director = useMemo(() => new AvatarDirector(), []);

  // TTS for Molly's spoken responses
  const { speakResponse, isVocalizing, audioElement, unlockAutoplay } = useTTS({
    isVocal: true,
  });

  // Live voice (Gemini bidirectional audio)
  const { isActive: voiceActive, toggle: toggleVoice } = useGeminiLive({
    onMollyText: useCallback(
      (text: string) => {
        // Detect tone from text → drive morph deltas
        const tone = detectEmotionalTone(text);
        director.voice.onEmotionalTone(tone);
        // Speak it
        speakResponse(text);
        // Log to bridge
        fetch('/api/bridge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from: 'molly', content: text }),
        }).catch(() => {});
      },
      [director, speakResponse]
    ),
    onEricTranscript: useCallback((text: string) => {
      if (!text.trim()) return;
      fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'eric', content: text }),
      }).catch(() => {});
    }, []),
    onStatusChange: setStatus,
  });

  // Poll bridge every 3 s
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/bridge?limit=30');
        if (!res.ok) return;
        const data = await res.json();
        setMessages(data.messages ?? []);
      } catch {
        // silent — bridge may not be running
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll feed
  useEffect(() => {
    feedRef.current?.scrollTo({
      top: feedRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

  const sendText = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;
    setInputText('');
    unlockAutoplay();
    await fetch('/api/bridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'eric', content: text }),
    }).catch(() => {});
  }, [inputText, unlockAutoplay]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendText();
      }
    },
    [sendText]
  );

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
      onClick={unlockAutoplay}
    >
      {/* ── Avatar canvas (top ~60%) ─────────────────────────────────────── */}
      <div className="relative flex-none" style={{ height: '60vh' }}>
        <MollyCanvas
          director={director}
          isVocalizing={isVocalizing}
          className="w-full h-full"
        />

        {/* Overlay: voice status */}
        <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
          {status && (
            <span className="text-xs text-muted-foreground bg-background/70 rounded-full px-3 py-1 backdrop-blur-sm">
              {status}
            </span>
          )}
        </div>

        {/* Overlay: model placeholder hint */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground/50">
            Drop molly.glb in /public/models/ to see the avatar
          </span>
        </div>
      </div>

      {/* ── Message feed (middle ~25%) ───────────────────────────────────── */}
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-4 py-2 space-y-2 border-t border-border"
      >
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-4">
            Family bridge feed will appear here
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-2 ${msg.from === 'molly' ? 'flex-row-reverse' : ''}`}
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-wide mt-0.5 ${
                msg.from === 'molly'
                  ? 'text-primary'
                  : msg.from === 'eric'
                    ? 'text-blue-500'
                    : 'text-amber-500'
              }`}
            >
              {msg.from}
            </span>
            <p
              className={`text-sm rounded-xl px-3 py-1.5 max-w-[75%] ${
                msg.from === 'molly'
                  ? 'bg-primary/10 text-foreground'
                  : 'bg-muted text-foreground'
              }`}
            >
              {msg.content}
            </p>
          </div>
        ))}
      </div>

      {/* ── Input bar (bottom) ───────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-border bg-background">
        <button
          onClick={() => {
            unlockAutoplay();
            toggleVoice();
          }}
          className={`flex-none rounded-full p-2 transition-colors ${
            voiceActive
              ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
          }`}
          title={voiceActive ? 'Stop voice' : 'Start voice'}
        >
          {voiceActive ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </button>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Molly…"
          className="flex-1 rounded-xl bg-muted px-4 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary"
        />

        <button
          onClick={sendText}
          disabled={!inputText.trim()}
          className="flex-none rounded-full p-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-colors"
          title="Send"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Hidden audio element for server TTS */}
      {audioElement}
    </div>
  );
}
