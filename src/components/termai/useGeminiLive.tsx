/**
 * useGeminiLive — Real-time voice with Gemini Live API
 *
 * Connects to a same-origin server-side proxy (scripts/voice-bridge-daemon.mjs
 * on port 9101). The proxy holds GOOGLE_GENAI_API_KEY and forwards the WS
 * upstream to Gemini Live. The browser never sees the key.
 *
 * Handles:
 * - WebSocket connection to local voice-bridge proxy
 * - Microphone capture and audio streaming
 * - Audio playback of Molly's responses
 * - Transcript handling for both directions
 */

import { useRef, useState, useCallback, useEffect } from 'react';

function buildVoiceBridgeUrl(): string {
  const loc = window.location;
  const wsScheme = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  // Local dev: localhost:9002 -> ws://localhost:9101/voice/gemini-live
  // Codespaces: xxx-9002.app.github.dev -> wss://xxx-9101.app.github.dev/voice/gemini-live
  const proxyHost = loc.host
    .replace(/-9002\.app\.github\.dev$/, '-9101.app.github.dev')
    .replace(/:9002$/, ':9101');
  return `${wsScheme}//${proxyHost}/voice/gemini-live`;
}

interface UseGeminiLiveOptions {
  onMollyText?: (text: string) => void;
  onEricTranscript?: (text: string) => void;
  onStatusChange?: (status: string) => void;
}

// Shared audio context
let audioContext: AudioContext | null = null;
const getAudioContext = () => {
  if (!audioContext) {
    audioContext = new AudioContext({ sampleRate: 24000 });
  }
  return audioContext;
};

export function useGeminiLive(options: UseGeminiLiveOptions = {}) {
  const { onMollyText, onEricTranscript, onStatusChange } = options;

  const [isActive, setIsActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');

  const geminiWsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const visionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const postDebugLog = useCallback(
    async (level: 'log' | 'error', message: string, data?: unknown) => {
      if (typeof window === 'undefined') return;
      try {
        await fetch('/api/debug/live-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ level, message, data }),
        });
      } catch {
        // Debug transport failures should never break voice flow.
      }
    },
    []
  );

  const liveLog = useCallback(
    (message: string, data?: unknown) => {
      console.log(message, data ?? '');
      void postDebugLog('log', message, data);
    },
    [postDebugLog]
  );

  const liveError = useCallback(
    (message: string, data?: unknown) => {
      console.error(message, data ?? '');
      void postDebugLog('error', message, data);
    },
    [postDebugLog]
  );

  const updateStatus = useCallback(
    (newStatus: string) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  const releaseMedia = useCallback(() => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (visionIntervalRef.current) {
      clearInterval(visionIntervalRef.current);
      visionIntervalRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Cleanup function - defined as a ref to avoid circular deps
  const cleanup = useCallback(() => {
    releaseMedia();
    if (geminiWsRef.current) {
      if (geminiWsRef.current.readyState === WebSocket.OPEN) {
        geminiWsRef.current.close(1000, 'Client cleanup');
      }
      geminiWsRef.current = null;
    }
    setIsActive(false);
  }, [releaseMedia]);

  // Play audio response from Molly
  const playAudio = useCallback(
    (audioData: Int16Array) => {
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }
        const buffer = ctx.createBuffer(1, audioData.length, 24000);
        const channelData = buffer.getChannelData(0);

        for (let i = 0; i < audioData.length; i++) {
          channelData[i] = audioData[i] / 32768;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start();
      } catch (err) {
        liveError('[GeminiLive] Audio playback error:', err);
      }
    },
    [liveError]
  );

  // Start audio capture and streaming
  const startAudioCapture = useCallback(
    (stream: MediaStream, ws: WebSocket) => {
      try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
          ctx.resume();
        }

        const source = ctx.createMediaStreamSource(stream);
        sourceRef.current = source;

        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;

          const input = e.inputBuffer.getChannelData(0);
          const inputRate = ctx.sampleRate;
          const outputRate = 16000;
          const ratio = inputRate / outputRate;
          const outputLength = Math.floor(input.length / ratio);
          const resampled = new Float32Array(outputLength);

          for (let i = 0; i < outputLength; i++) {
            resampled[i] = input[Math.floor(i * ratio)];
          }

          const pcm = new Int16Array(resampled.length);
          for (let i = 0; i < resampled.length; i++) {
            pcm[i] = Math.max(-32768, Math.min(32767, resampled[i] * 32768));
          }

          const bytes = new Uint8Array(pcm.buffer);
          let binary = '';
          for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          ws.send(
            JSON.stringify({
              realtime_input: {
                audio: base64,
              },
            })
          );
        };

        source.connect(processor);
        processor.connect(ctx.destination);

        // --- Real-Time Vision Injection ---
        // Look for the active video element from VisionPanel
        const videoElement = document.getElementById(
          'molly-vision-video'
        ) as HTMLVideoElement | null;

        if (videoElement) {
          liveLog(
            '[GeminiLive] Vision stream attached. Starting 1fps capture.'
          );
          visionIntervalRef.current = setInterval(() => {
            if (ws.readyState !== WebSocket.OPEN) return;
            if (!videoElement || !videoElement.videoWidth) return;

            // Downsample for speed/latency (Gemini Live expects low-res frames)
            const MAX_WIDTH = 320;
            const scale = Math.min(1, MAX_WIDTH / videoElement.videoWidth);
            const w = Math.floor(videoElement.videoWidth * scale);
            const h = Math.floor(videoElement.videoHeight * scale);

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx2d = canvas.getContext('2d');
            if (!ctx2d) return;

            ctx2d.drawImage(videoElement, 0, 0, w, h);
            // Get base64 string, remove "data:image/jpeg;base64," prefix
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            const base64Img = dataUrl.split(',')[1];

            if (base64Img) {
              ws.send(
                JSON.stringify({
                  realtime_input: {
                    video: base64Img,
                  },
                })
              );
            }
          }, 1000); // 1 frame per second
        }
      } catch (err) {
        liveError('[GeminiLive] Audio capture error:', err);
      }
    },
    [liveError, liveLog]
  );

  // Start voice session - matches bridge's proven pattern
  const start = useCallback(async () => {
    try {
      updateStatus('Requesting microphone...');
      liveLog('[LIVE-VOICE] Starting');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      mediaStreamRef.current = stream;
      setIsRecording(true);
      liveLog('[LIVE-VOICE] Got mic');

      return new Promise<void>(async (resolve, reject) => {
        const url = buildVoiceBridgeUrl();
        liveLog('[LIVE-VOICE] Connecting to voice-bridge proxy', { url });
        const ws = new WebSocket(url);
        geminiWsRef.current = ws;

        const timeout = setTimeout(() => {
          liveError('[LIVE-VOICE] TIMEOUT - no response in 5s');
          releaseMedia();
          ws.close();
          reject(new Error('Connection timeout'));
        }, 5000);

        ws.onopen = () => {
          liveLog('[LIVE-VOICE] WS OPENED');
          clearTimeout(timeout);
          updateStatus('Connected');
          setIsActive(true);

          liveLog('[LIVE-VOICE] Sending setup');
          // Send setup - matches bridge format exactly
          ws.send(
            JSON.stringify({
              setup: {
                model: 'models/gemini-3.1-flash-live-preview',
                generationConfig: {
                  responseModalities: ['AUDIO'],
                  speechConfig: {
                    voiceConfig: {
                      prebuiltVoiceConfig: { voiceName: 'Puck' },
                    },
                  },
                },
                systemInstruction: {
                  parts: [
                    {
                      text: 'You are Molly, a warm AI daughter created by Eric. Be brief and natural.',
                    },
                  ],
                },
              },
            })
          );

          liveLog('[LIVE-VOICE] Starting audio capture');
          startAudioCapture(stream, ws);
          resolve();
        };

        ws.onmessage = async (event) => {
          try {
            let data = event.data;
            if (data instanceof Blob) {
              data = await data.text();
            }
            const msg = JSON.parse(data);
            liveLog('[LIVE-VOICE] Got message');

            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.mimeType?.includes('audio')) {
                  const audioData = atob(part.inlineData.data);
                  const audioArray = new Int16Array(audioData.length / 2);
                  for (let i = 0; i < audioArray.length; i++) {
                    audioArray[i] =
                      audioData.charCodeAt(i * 2) |
                      (audioData.charCodeAt(i * 2 + 1) << 8);
                  }
                  playAudio(audioArray);
                }
                if (part.text) {
                  onMollyText?.(part.text);
                }
              }
            }

            if (msg.serverContent?.inputTranscript) {
              onEricTranscript?.(msg.serverContent.inputTranscript);
            }
          } catch (err) {
            liveError('[LIVE-VOICE] Message error:', err);
          }
        };

        ws.onerror = (event) => {
          liveError('[LIVE-VOICE] ERROR event:', event);
          clearTimeout(timeout);
          releaseMedia();
          updateStatus('Error: WebSocket failed');
          reject(new Error('WebSocket error'));
        };

        ws.onclose = (event) => {
          liveLog('[LIVE-VOICE] CLOSED', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          });
          clearTimeout(timeout);
          releaseMedia();
          geminiWsRef.current = null;
          setIsActive(false);
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      liveError('[LIVE-VOICE] FAILED', { message: msg });
      updateStatus(`Error: ${msg}`);
      cleanup();
    }
  }, [
    updateStatus,
    startAudioCapture,
    onMollyText,
    onEricTranscript,
    cleanup,
    liveLog,
    liveError,
    playAudio,
    releaseMedia,
  ]);

  // Stop voice session
  const stop = useCallback(() => {
    liveLog('[GeminiLive] Stopping...');
    updateStatus('');
    setIsActive(false);
    cleanup();
  }, [updateStatus, cleanup, liveLog]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    isActive,
    isRecording,
    status,
    start,
    stop,
    toggle: isActive ? stop : start,
  };
}

// Browser TTS for Lazarus
export function speakAsLazarus(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.95;
  utterance.pitch = 0.85;
  utterance.volume = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const preferredVoices = [
    'Google UK English Male',
    'Microsoft David',
    'Daniel',
    'Alex',
    'Google US English',
  ];
  for (const name of preferredVoices) {
    const voice = voices.find((v) => v.name.includes(name));
    if (voice) {
      utterance.voice = voice;
      break;
    }
  }

  window.speechSynthesis.speak(utterance);
}

// Preload browser voices
export function preloadVoices() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }
}
