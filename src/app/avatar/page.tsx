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
import { ArrowLeft, Mic, MicOff, Send, X } from 'lucide-react';

// Canvas is WebGL — must be client-only, no SSR
const MollyCanvas = dynamic(() => import('@/browser/canvas/MollyCanvas'), {
  ssr: false,
});

// ── Types ──────────────────────────────────────────────────────────────────

interface BridgeMessage {
  id: string;
  from: 'molly' | 'eric' | 'lazarus';
  content: string;
  timestamp: string;
}

// ── Avatar page ────────────────────────────────────────────────────────────

export default function AvatarPage() {
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('');
  const [roboticsStatus, setRoboticsStatus] = useState(
    'No active robotics plan'
  );
  const [modelX, setModelX] = useState(0);
  const [modelY, setModelY] = useState(0);
  const [modelZ, setModelZ] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [visionEnabled, setVisionEnabled] = useState(true);
  const activePlanSignatureRef = useRef<string | null>(null);
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

  // Poll bridge and active robotics plan every 3 s.
  useEffect(() => {
    const poll = async () => {
      try {
        const [bridgeRes, planRes] = await Promise.all([
          fetch('/api/bridge?limit=30'),
          fetch('/api/robotics/active-plan', { cache: 'no-store' }),
        ]);

        if (bridgeRes.ok) {
          const bridgeData = await bridgeRes.json();
          const msgs = bridgeData.messages ?? [];
          setMessages(msgs);
          if (msgs.length === 0) {
            console.log('[Avatar] No messages yet');
          }
        } else {
          console.error('[Avatar] Bridge fetch failed:', bridgeRes.status);
        }

        if (planRes.ok) {
          const planData = await planRes.json();
          const incomingPlan = planData.plan as {
            id?: string;
            goal?: string;
            actions?: unknown[];
          } | null;

          if (!incomingPlan?.id) {
            activePlanSignatureRef.current = null;
            director.robotics.clearPlan();
            setRoboticsStatus('No active robotics plan');
            return;
          }

          const planSignature = `${incomingPlan.id}:${planData.updatedAt ?? 0}`;

          if (planSignature !== activePlanSignatureRef.current) {
            director.robotics.loadPlan(planData.plan);
            activePlanSignatureRef.current = planSignature;
          }

          const actionCount = Array.isArray(incomingPlan.actions)
            ? incomingPlan.actions.length
            : 0;
          setRoboticsStatus(
            `Robotics: ${incomingPlan.goal || 'Active plan'} (${actionCount} steps)${planData.source ? ` • ${planData.source}` : ''}`
          );
        }
      } catch (err) {
        console.error('[Avatar] Polling error:', err);
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
    try {
      const res = await fetch('/api/bridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'eric', content: text }),
      });
      if (!res.ok) {
        console.error('[Avatar] Failed to send message:', res.status, res.statusText);
      }
    } catch (err) {
      console.error('[Avatar] Error sending message:', err);
    }
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

  const closeOrReturn = useCallback(() => {
    if (window.opener && !window.opener.closed) {
      window.close();
      return;
    }
    window.location.href = '/';
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeOrReturn();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeOrReturn]);

  return (
    <div
      className="flex flex-col h-screen bg-background text-foreground overflow-hidden"
      onClick={unlockAutoplay}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-background/95 backdrop-blur-sm">
        <button
          onClick={() => {
            if (window.opener && !window.opener.closed) {
              window.close();
              return;
            }
            window.location.href = '/';
          }}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Return"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Return
        </button>
        <span className="text-xs text-muted-foreground">Avatar Window</span>
        <button
          onClick={closeOrReturn}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Close"
        >
          <X className="h-3.5 w-3.5" />
          Close
        </button>
      </div>

      {/* ── Avatar canvas (top ~60%) ─────────────────────────────────────── */}
      <div className="relative flex-none" style={{ height: '60vh' }}>
        <MollyCanvas
          director={director}
          isVocalizing={isVocalizing}
          modelPosition={{ x: modelX, y: modelY, z: modelZ }}
          zoom={zoom}
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

        {/* Overlay: robotics plan status */}
        <div className="absolute top-3 right-3 pointer-events-none">
          <span className="text-[10px] text-muted-foreground bg-background/70 rounded-full px-2.5 py-1 backdrop-blur-sm">
            {roboticsStatus}
          </span>
        </div>

        {/* Overlay: position & zoom controls (top-left) */}
        <div className="absolute top-3 left-3 bg-background/90 backdrop-blur-sm rounded-lg p-3 space-y-2 text-xs pointer-events-auto">
          <div className="space-y-1">
            <label className="block text-muted-foreground">X: {modelX.toFixed(2)}</label>
            <input
              type="range"
              min="-10"
              max="10"
              step="0.1"
              value={modelX}
              onChange={(e) => setModelX(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-muted-foreground">Y: {modelY.toFixed(2)}</label>
            <input
              type="range"
              min="-10"
              max="10"
              step="0.1"
              value={modelY}
              onChange={(e) => setModelY(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-muted-foreground">Z: {modelZ.toFixed(2)}</label>
            <input
              type="range"
              min="-10"
              max="10"
              step="0.1"
              value={modelZ}
              onChange={(e) => setModelZ(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="h-px bg-border my-1" />
          <div className="space-y-1">
            <label className="block text-muted-foreground">Zoom: {zoom.toFixed(2)}x</label>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <button
            onClick={async () => {
              try {
                const res = await fetch('/api/robotics/test-plan', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({}),
                });
                if (res.ok) {
                  setRoboticsStatus('Test plan loaded');
                }
              } catch (err) {
                setRoboticsStatus(`Error: ${String(err)}`);
              }
            }}
            className="mt-2 w-full rounded bg-primary text-primary-foreground text-xs py-1 hover:bg-primary/90 transition-colors"
          >
            Load Test Plan
          </button>
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
