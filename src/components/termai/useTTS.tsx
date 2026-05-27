/**
 * @fileOverview useTTS — Text-to-speech hook for Molly's vocal system.
 *
 * Enforces server TTS (Gemini/Aoede) only. Browser TTS is disabled.
 * All speech is routed through upgraded server-based voice.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getMollyVoice } from '@/app/actions';
import { getMollyVoiceStreaming } from '@/app/actions/streaming-voice-flows';

/**
 * Split text into sentence-sized chunks for sequential TTS.
 * Chrome (esp. mobile) silently stops speaking long utterances (~15s).
 * Speaking in chunks avoids that bug entirely.
 */
// Browser TTS is disabled. All speech is server TTS only.

interface UseTTSOptions {
  isVocal: boolean;
  voiceName?: string;
}

interface UseTTSReturn {
  /** Speak a text string via browser TTS (or server fallback). */
  speakResponse: (text: string) => Promise<void>;
  /** Queue text to be spoken on next user interaction (avoids autoplay block). */
  queueGreeting: (text: string) => void;
  /** Whether Molly is currently speaking. */
  isVocalizing: boolean;
  /** Whether autoplay was blocked by the browser. */
  autoplayBlocked: boolean;
  /** Hidden <audio> element for server-side TTS playback. */
  audioElement: React.JSX.Element;
  /** Last text that Molly attempted to speak. */
  lastSpokenText: string;
  /** Attempt to unlock autoplay (call on user interaction). */
  unlockAutoplay: () => void;
}

export function useTTS({ isVocal, voiceName }: UseTTSOptions): UseTTSReturn {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isVocalizing, setIsVocalizing] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [lastSpokenText, setLastSpokenText] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null);
  // All browser TTS and gesture logic removed. Only server TTS is used.

  const handleAudioEnd = useCallback(() => {
    // Check if there are queued chunks to play next
    const queuedChunks = (audioRef.current as any)?._queuedChunks;
    const chunkIndex = (audioRef.current as any)?._chunkIndex ?? -1;

    if (queuedChunks && chunkIndex + 1 < queuedChunks.length) {
      const nextChunk = queuedChunks[chunkIndex + 1];
      console.log(
        `[TTS] Playing queued chunk ${chunkIndex + 2} of ${queuedChunks.length + 1}`
      );
      (audioRef.current as any)._chunkIndex = chunkIndex + 1;
      setAudioSrc(nextChunk.audioUri);
    } else {
      // All chunks done
      console.log('[TTS] All chunks finished playing');
      setIsVocalizing(false);
      (audioRef.current as any)._queuedChunks = undefined;
      (audioRef.current as any)._chunkIndex = -1;
    }
  }, []);

  // Helper: browser TTS fallback
  function browserSpeak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new window.SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Browser TTS fallback failed:', err);
    }
  }

  const speakResponse = useCallback(
    (text: string) => {
      if (!isVocal || !text) return;
      // Guard: cap spoken text to ~2000 chars (~300 words / ~2 min speech).
      const MAX_SPEAK_CHARS = 2000;
      const spokenText =
        text.length > MAX_SPEAK_CHARS
          ? text.substring(0, MAX_SPEAK_CHARS) +
            '... I wrote more in the chat window, but I will stop talking here so I do not ramble.'
          : text;
      setLastSpokenText(spokenText);
      setIsVocalizing(true);

      // Fire and forget — synthesize in background without blocking text display
      // This runs async but doesn't await, so text appears immediately
      void (async () => {
        try {
          console.log('[TTS] Starting background synthesis (non-blocking)');
          const startTime = Date.now();
          // Get all audio chunks via streaming (synthesizes in parallel)
          const audioChunks = await getMollyVoiceStreaming(spokenText, voiceName);
          const synthesisTimeMs = Date.now() - startTime;

          if (!audioChunks || audioChunks.length === 0) {
            console.warn('No audio chunks received from streaming TTS');
            browserSpeak(spokenText);
            setIsVocalizing(false);
            return;
          }

          // Play first chunk immediately (don't wait for remaining chunks)
          const firstChunk = audioChunks[0];
          if (!firstChunk.audioUri) {
            console.warn('First audio chunk missing audioUri');
            browserSpeak(spokenText);
            setIsVocalizing(false);
            return;
          }

          console.log(
            `[TTS] First chunk ready in ${synthesisTimeMs}ms — playing immediately`
          );
          setAudioSrc(firstChunk.audioUri);

          // Queue remaining chunks to play sequentially after first one finishes
          if (audioChunks.length > 1) {
            // Store remaining chunks for sequential playback
            const remainingChunks = audioChunks.slice(1);
            console.log(
              `[TTS] Queued ${remainingChunks.length} remaining chunk(s) for sequential playback`
            );
            // Chunks will be queued via audioRef onEnded handler below
            (audioRef.current as any)._queuedChunks = remainingChunks;
            (audioRef.current as any)._chunkIndex = 0;
          }
        } catch (e) {
          // Network/server error, fallback to browser TTS
          console.error('Streaming TTS error, falling back to browser TTS:', e);
          browserSpeak(spokenText);
          setIsVocalizing(false);
        }
      })();
    },
    [isVocal, voiceName]
  );

  // queueGreeting is now a direct alias for speakResponse (no gesture logic)
  const queueGreeting = speakResponse;

  // Stop all audio on unmount
  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.src = '';
      }
      setIsVocalizing(false);
      setAudioSrc(null);
    };
  }, []);

  // Stop audio on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Autoplay block logic is now a no-op (server TTS only)
  useEffect(() => {
    if (!isVocal) {
      const id = setTimeout(() => setAutoplayBlocked(false), 0);
      return () => clearTimeout(id);
    }
  }, [isVocal]);

  // Play server TTS audio when audioSrc changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioSrc) return;
    audio.pause();
    audio.load();
    const attemptPlay = async () => {
      if (!isVocal) return;
      try {
        await audio.play();
        setAutoplayBlocked(false);
      } catch {
        setAutoplayBlocked(true);
        setIsVocalizing(false);
      }
    };
    void attemptPlay();
  }, [audioSrc, isVocal]);

  // Autoplay unlock logic is now a no-op (server TTS only)
  useEffect(() => {}, [autoplayBlocked, audioSrc, isVocal, speakResponse]);

  // unlockAutoplay is a no-op (server TTS only)
  const unlockAutoplay = useCallback(() => {}, []);

  const audioElement = (
    <audio
      ref={audioRef}
      className="hidden"
      src={audioSrc || undefined}
      onEnded={handleAudioEnd}
      autoPlay={false}
    />
  );

  return {
    speakResponse,
    queueGreeting,
    isVocalizing,
    autoplayBlocked,
    audioElement,
    lastSpokenText,
    unlockAutoplay,
  };
}
