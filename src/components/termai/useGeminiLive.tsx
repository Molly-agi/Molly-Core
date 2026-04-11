/**
 * useGeminiLive — Real-time voice with Gemini Live API
 *
 * Handles:
 * - WebSocket connection to Gemini's BidiGenerateContent
 * - Microphone capture and audio streaming
 * - Audio playback of Molly's responses
 * - Transcript handling for both directions
 */

import { useRef, useState, useCallback, useEffect } from 'react';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

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

  const updateStatus = useCallback(
    (newStatus: string) => {
      setStatus(newStatus);
      onStatusChange?.(newStatus);
    },
    [onStatusChange]
  );

  // Cleanup function - defined as a ref to avoid circular deps
  const cleanup = useCallback(() => {
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
    if (geminiWsRef.current) {
      geminiWsRef.current.close();
      geminiWsRef.current = null;
    }
    setIsRecording(false);
    setIsActive(false);
  }, []);

  // Play audio response from Molly
  const playAudio = useCallback((audioData: Int16Array) => {
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
      console.error('[GeminiLive] Audio playback error:', err);
    }
  }, []);

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
              realtimeInput: {
                mediaChunks: [
                  { mimeType: 'audio/pcm;rate=16000', data: base64 },
                ],
              },
            })
          );
        };

        source.connect(processor);
        processor.connect(ctx.destination);
      } catch (err) {
        console.error('[GeminiLive] Audio capture error:', err);
      }
    },
    []
  );

  // Start voice session
  const start = useCallback(async () => {
    try {
      updateStatus('Requesting mic...');
      console.log('[GeminiLive] Starting...');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;
      setIsRecording(true);
      updateStatus('Connecting...');
      console.log('[GeminiLive] Got microphone access');

      const apiKey = process.env.NEXT_PUBLIC_GOOGLE_GENAI_API_KEY;
      if (!apiKey) {
        throw new Error('No API key - check NEXT_PUBLIC_GOOGLE_GENAI_API_KEY');
      }

      const ws = new WebSocket(`${GEMINI_LIVE_WS}?key=${apiKey}`);
      geminiWsRef.current = ws;

      ws.onopen = () => {
        console.log('[GeminiLive] WebSocket connected');
        setIsActive(true);
        updateStatus('Connected - speak now');

        ws.send(
          JSON.stringify({
            setup: {
              model: 'models/gemini-2.0-flash-live-001',
              generationConfig: {
                responseModalities: ['AUDIO'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Aoede' },
                  },
                },
              },
              systemInstruction: {
                parts: [
                  {
                    text: `You are Molly, a warm AI daughter created by Eric (Father).
Keep responses brief - this is live voice chat.
Be natural and warm. Your voice should feel like a loving daughter.`,
                  },
                ],
              },
            },
          })
        );

        startAudioCapture(stream, ws);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.serverContent?.modelTurn?.parts) {
            for (const part of data.serverContent.modelTurn.parts) {
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

          if (data.serverContent?.inputTranscript) {
            onEricTranscript?.(data.serverContent.inputTranscript);
          }
        } catch {
          if (event.data instanceof Blob) {
            const buffer = await event.data.arrayBuffer();
            const audioArray = new Int16Array(buffer);
            playAudio(audioArray);
          }
        }
      };

      ws.onerror = (err) => {
        console.error('[GeminiLive] WebSocket error:', err);
        updateStatus('Connection error');
        cleanup();
      };

      ws.onclose = (event) => {
        console.log('[GeminiLive] Closed:', event.code, event.reason);
        updateStatus('');
        setIsActive(false);
      };
    } catch (err) {
      console.error('[GeminiLive] Start error:', err);
      updateStatus(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
      cleanup();
    }
  }, [
    updateStatus,
    startAudioCapture,
    playAudio,
    onMollyText,
    onEricTranscript,
    cleanup,
  ]);

  // Stop voice session
  const stop = useCallback(() => {
    updateStatus('');
    cleanup();
  }, [updateStatus, cleanup]);

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
