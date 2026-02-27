/**
 * @fileOverview useTTS — Text-to-speech hook for Molly's vocal system.
 *
 * Encapsulates browser TTS (free, instant) with server TTS fallback,
 * voice pre-warming, autoplay unlock logic, and audio lifecycle management.
 *
 * Extracted from Terminal.tsx during Phase 6 hardening.
 */

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getMollyVoice } from '@/app/actions';

interface UseTTSOptions {
  isVocal: boolean;
}

interface UseTTSReturn {
  /** Speak a text string via browser TTS (or server fallback). */
  speakResponse: (text: string) => Promise<void>;
  /** Whether Molly is currently speaking. */
  isVocalizing: boolean;
  /** Whether autoplay was blocked by the browser. */
  autoplayBlocked: boolean;
  /** Hidden <audio> element for server-side TTS playback. */
  audioElement: React.JSX.Element;
  /** Attempt to unlock autoplay (call on user interaction). */
  unlockAutoplay: () => void;
}

export function useTTS({ isVocal }: UseTTSOptions): UseTTSReturn {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isVocalizing, setIsVocalizing] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const preloadedVoicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const pendingTextRef = useRef<string | null>(null);
  const hasUserGestureRef = useRef(false);

  // Pre-warm browser TTS voices on mount so they're ready instantly
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => {
      preloadedVoicesRef.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () =>
      window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const handleAudioEnd = useCallback(() => setIsVocalizing(false), []);

  const speakResponse = useCallback(
    async (text: string) => {
      if (!isVocal || !text || isVocalizing) return;
      setIsVocalizing(true);

      try {
        // Browser TTS path (free, instant)
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          await new Promise<void>((resolve) => {
            try {
              window.speechSynthesis.cancel();

              const utterance = new SpeechSynthesisUtterance(text);
              let didResolve = false;

              const voices =
                preloadedVoicesRef.current.length > 0
                  ? preloadedVoicesRef.current
                  : window.speechSynthesis.getVoices();

              // Priority-ordered search for a feminine voice across platforms
              const femalePatterns = [
                // Exact known female voices
                'samantha', // macOS/iOS
                'zira', // Windows
                'hazel', // Windows UK
                'susan', // Windows UK
                'karen', // macOS Australian
                'moira', // macOS Irish
                'tessa', // macOS South African
                'fiona', // macOS Scottish
                'victoria', // macOS
                'allison', // macOS
                'ava', // macOS
                // Google voices
                'google us english',
                'google uk english female',
                // Generic pattern
                'female',
                // Android Google TTS female voice IDs
                'en-us-x-sfg', // Samantha-like on Android
                'en-us-x-tpc', // Female on Android
                'en-us-x-iom', // Female on Android
                'en-gb-x-fis', // UK Female on Android
              ];

              let selectedVoice: SpeechSynthesisVoice | undefined;
              for (const pattern of femalePatterns) {
                selectedVoice = voices.find((v) =>
                  v.name.toLowerCase().includes(pattern)
                );
                if (selectedVoice) break;
              }

              // Fallback: prefer any English voice, set higher pitch for feminine tone
              if (!selectedVoice) {
                selectedVoice = voices.find(
                  (v) => v.lang.startsWith('en') && v.localService
                );
              }

              if (selectedVoice) {
                utterance.voice = selectedVoice;
              }

              utterance.rate = 1.0;
              // Slightly higher pitch when we couldn't confirm a female voice
              utterance.pitch =
                selectedVoice &&
                femalePatterns.some((p) =>
                  selectedVoice!.name.toLowerCase().includes(p)
                )
                  ? 1.0
                  : 1.15;
              utterance.volume = 1.0;

              const watchdog = window.setTimeout(() => {
                if (didResolve) return;
                didResolve = true;
                try {
                  window.speechSynthesis.cancel();
                } catch {
                  /* no-op */
                }
                setIsVocalizing(false);
                resolve();
              }, 30_000);

              utterance.onend = () => {
                if (didResolve) return;
                didResolve = true;
                window.clearTimeout(watchdog);
                setIsVocalizing(false);
                resolve();
              };

              utterance.onerror = (event) => {
                if (didResolve) return;
                didResolve = true;
                window.clearTimeout(watchdog);

                if (event.error === 'not-allowed') {
                  // Browser blocked TTS because no user gesture yet.
                  // Queue text for replay after the first click/tap.
                  console.warn(
                    '[TTS] Autoplay blocked — queued for user gesture'
                  );
                  pendingTextRef.current = text;
                  setAutoplayBlocked(true);
                } else {
                  console.warn('[TTS] Browser TTS error:', event.error);
                }

                setIsVocalizing(false);
                resolve();
              };

              window.speechSynthesis.speak(utterance);
            } catch (error) {
              console.error('[TTS] Browser TTS start failed:', error);
              setIsVocalizing(false);
              resolve();
            }
          });
          return;
        }

        // Fallback: server TTS (Gemini) — only if browser TTS unavailable
        const voiceResponse = await getMollyVoice(text);
        if (!voiceResponse.audioUri) {
          console.warn('Vocal cords returned no audio:', voiceResponse.error);
          setIsVocalizing(false);
          return;
        }
        setAudioSrc(voiceResponse.audioUri);
      } catch (e) {
        console.error('Vocal error:', e);
        setIsVocalizing(false);
      }
    },
    [isVocal, isVocalizing]
  );

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

  // Clear autoplay block when vocal is disabled
  useEffect(() => {
    if (!isVocal) {
      setAutoplayBlocked(false);
    }
  }, [isVocal]);

  // Attempt to play when audioSrc changes (server TTS path)
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
      } catch (error) {
        console.warn('Audio autoplay blocked:', error);
        setAutoplayBlocked(true);
        setIsVocalizing(false);
      }
    };

    void attemptPlay();
  }, [audioSrc, isVocal]);

  // Autoplay unlock on user interaction (handles both browser TTS and audio element)
  useEffect(() => {
    if (!autoplayBlocked) return;

    const handleUnlock = () => {
      hasUserGestureRef.current = true;

      // If we have queued browser-TTS text, replay it now
      const pending = pendingTextRef.current;
      if (pending && isVocal && 'speechSynthesis' in window) {
        pendingTextRef.current = null;
        setAutoplayBlocked(false);
        // Re-invoke speakResponse; the gesture is now active
        speakResponse(pending);
        return;
      }

      // Fallback: server-TTS audio element
      const audio = audioRef.current;
      if (!audio || !audioSrc || !isVocal) return;
      setIsVocalizing(true);
      audio
        .play()
        .then(() => setAutoplayBlocked(false))
        .catch(() => {
          setIsVocalizing(false);
        });
    };

    window.addEventListener('pointerdown', handleUnlock, { once: true });
    return () => window.removeEventListener('pointerdown', handleUnlock);
  }, [autoplayBlocked, audioSrc, isVocal, speakResponse]);

  const unlockAutoplay = useCallback(() => {
    hasUserGestureRef.current = true;
    // If there's pending browser-TTS text, speak it
    const pending = pendingTextRef.current;
    if (pending && isVocal) {
      pendingTextRef.current = null;
      setAutoplayBlocked(false);
      speakResponse(pending);
      return;
    }
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [isVocal, speakResponse]);

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
    isVocalizing,
    autoplayBlocked,
    audioElement,
    unlockAutoplay,
  };
}
