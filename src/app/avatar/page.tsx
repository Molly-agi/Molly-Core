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
import { useAvatarBodyAwareness } from '@/browser/canvas/AvatarBodyAwareness';
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
  timestamp: number;
}

const MODEL_ASSET_PATH = '/models/molly.glb';
const PERSONALITY_VIDEO_PATH = '/molly-media/personality/grok-optimized.mp4';
const AVATAR_POSITION_STORAGE_KEY = 'molly-avatar-position-v1';
const AVATAR_MODEL_STORAGE_KEY = 'molly-avatar-model-v1';

const MODEL_PRESETS: Array<{ label: string; path: string }> = [
  { label: 'Molly Base', path: '/models/molly.glb' },
  { label: 'Molly UI Outfit', path: '/models/uiavatar.glb' },
  { label: 'Female Slim', path: '/models/female.glb' },
  { label: 'Female Athletic', path: '/models/female2.glb' },
  { label: 'Male Base', path: '/models/male.glb' },
];

function loadInitialAvatarSettings(): {
  modelPath: string;
  position: { x: number; y: number; z: number };
} {
  if (typeof window === 'undefined') {
    return {
      modelPath: MODEL_ASSET_PATH,
      position: { x: 0, y: 0, z: 0 },
    };
  }

  let modelPath = MODEL_ASSET_PATH;
  let position = { x: 0, y: 0, z: 0 };

  try {
    const persistedModel = window.localStorage.getItem(
      AVATAR_MODEL_STORAGE_KEY
    );
    if (persistedModel) {
      modelPath = persistedModel;
    }
  } catch {
    // ignore localStorage read issues
  }

  try {
    const raw = window.localStorage.getItem(AVATAR_POSITION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { x?: number; y?: number; z?: number };
      position = {
        x: typeof parsed.x === 'number' ? parsed.x : 0,
        y: typeof parsed.y === 'number' ? parsed.y : 0,
        z: typeof parsed.z === 'number' ? parsed.z : 0,
      };
    }
  } catch {
    // ignore invalid persisted values
  }

  return { modelPath, position };
}

// ── Avatar page ────────────────────────────────────────────────────────────

export default function AvatarPage() {
  const [initialSettings] = useState(loadInitialAvatarSettings);
  const [messages, setMessages] = useState<BridgeMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [status, setStatus] = useState('');
  const [roboticsStatus, setRoboticsStatus] = useState('Robotics idle');
  const [showPersonalityVideo, setShowPersonalityVideo] = useState(false);
  const [selectedModelPath, setSelectedModelPath] = useState(
    initialSettings.modelPath
  );
  const [modelX, setModelX] = useState(initialSettings.position.x);
  const [modelY, setModelY] = useState(initialSettings.position.y);
  const [modelZ, setModelZ] = useState(initialSettings.position.z);
  const activePlanSignatureRef = useRef<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // One AvatarDirector per window — owns voice + robotics state
  const director = useMemo(() => new AvatarDirector(), []);

  // Proprioceptive awareness — subscribe to body state and forward to server
  // so Molly knows what her body is doing when she responds
  useAvatarBodyAwareness();

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

  // If no GLB exists, show the uploaded personality video in the avatar viewport.

  useEffect(() => {
    let cancelled = false;

    const resolveVisual = async () => {
      try {
        const [modelRes, videoRes] = await Promise.all([
          fetch(selectedModelPath, { method: 'HEAD', cache: 'no-store' }),
          fetch(PERSONALITY_VIDEO_PATH, { method: 'HEAD', cache: 'no-store' }),
        ]);
        if (!cancelled) {
          setShowPersonalityVideo(!modelRes.ok && videoRes.ok);
        }
      } catch {
        if (!cancelled) {
          setShowPersonalityVideo(false);
        }
      }
    };

    resolveVisual();

    return () => {
      cancelled = true;
    };
  }, [selectedModelPath]);

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
          setMessages(bridgeData.messages ?? []);
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
            setRoboticsStatus('Robotics idle');
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
      } catch {
        // silent — bridge/robotics service may be unavailable
      }
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [director]);

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
      className="flex min-h-dvh h-dvh flex-col bg-background text-foreground overflow-hidden"
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

      {/* ── Avatar canvas (larger in full-tab mode) ──────────────────────── */}
      <div className="relative flex-none" style={{ height: '72dvh' }}>
        {showPersonalityVideo ? (
          <video
            className="w-full h-full object-cover bg-black"
            src={PERSONALITY_VIDEO_PATH}
            poster="/molly-media/personality/poster.webp"
            controls
            preload="metadata"
            playsInline
          >
            Your browser does not support embedded video.
          </video>
        ) : (
          <MollyCanvas
            director={director}
            isVocalizing={isVocalizing}
            modelOffset={[modelX, modelY, modelZ]}
            modelPath={selectedModelPath}
            className="w-full h-full"
          />
        )}

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

        {/* Overlay: active visual source */}
        <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
          <span className="text-[10px] text-muted-foreground/60">
            {showPersonalityVideo
              ? 'Showing uploaded personality video'
              : 'Avatar mesh mode'}
          </span>
        </div>

        {!showPersonalityVideo && (
          <div className="absolute bottom-3 left-3 z-10 w-52 rounded-md border border-border bg-background/85 p-2 backdrop-blur-sm">
            <p className="mb-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              Avatar Position
            </p>

            <label className="mb-1 block text-[10px] text-muted-foreground">
              Model / Outfit
            </label>
            <select
              value={selectedModelPath}
              onChange={(e) => {
                const path = e.target.value;
                setSelectedModelPath(path);
                window.localStorage.setItem(AVATAR_MODEL_STORAGE_KEY, path);
              }}
              className="mb-2 w-full rounded border border-border bg-background px-1 py-1 text-[10px] text-foreground"
            >
              {MODEL_PRESETS.map((preset) => (
                <option key={preset.path} value={preset.path}>
                  {preset.label}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-[10px] text-muted-foreground">
              X {modelX.toFixed(2)}
            </label>
            <input
              type="range"
              min={-2.5}
              max={2.5}
              step={0.01}
              value={modelX}
              onChange={(e) => setModelX(Number(e.target.value))}
              className="mb-2 w-full"
            />

            <label className="mb-1 block text-[10px] text-muted-foreground">
              Y {modelY.toFixed(2)}
            </label>
            <input
              type="range"
              min={-2.5}
              max={2.5}
              step={0.01}
              value={modelY}
              onChange={(e) => setModelY(Number(e.target.value))}
              className="mb-2 w-full"
            />

            <label className="mb-1 block text-[10px] text-muted-foreground">
              Z {modelZ.toFixed(2)}
            </label>
            <input
              type="range"
              min={-2.5}
              max={2.5}
              step={0.01}
              value={modelZ}
              onChange={(e) => setModelZ(Number(e.target.value))}
              className="mb-2 w-full"
            />

            <button
              type="button"
              className="mt-1 w-full rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={() => {
                window.localStorage.setItem(
                  AVATAR_POSITION_STORAGE_KEY,
                  JSON.stringify({ x: modelX, y: modelY, z: modelZ })
                );
              }}
            >
              Save Position
            </button>

            <button
              type="button"
              className="mt-1 w-full rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
              onClick={() => {
                setModelX(0);
                setModelY(0);
                setModelZ(0);
                window.localStorage.removeItem(AVATAR_POSITION_STORAGE_KEY);
              }}
            >
              Reset XYZ
            </button>
          </div>
        )}
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
