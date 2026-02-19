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
              const femaleVoice = voices.find(
                (voice) =>
                  voice.name.toLowerCase().includes('female') ||
                  voice.name.toLowerCase().includes('samantha') ||
                  voice.name.toLowerCase().includes('zira') ||
                  voice.name.toLowerCase().includes('google us english')
              );
              if (femaleVoice) {
                utterance.voice = femaleVoice;
              }

              utterance.rate = 1.0;
              utterance.pitch = 1.0;
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
              }, 2500);

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
                console.error('[TTS] Browser TTS error:', event.error);
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

  // Autoplay unlock on user interaction
  useEffect(() => {
    if (!autoplayBlocked) return;

    const handleUnlock = () => {
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
  }, [autoplayBlocked, audioSrc, isVocal]);

  const unlockAutoplay = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, []);

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
