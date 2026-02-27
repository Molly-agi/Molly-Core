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

/**
 * Split text into sentence-sized chunks for sequential TTS.
 * Chrome (esp. mobile) silently stops speaking long utterances (~15s).
 * Speaking in chunks avoids that bug entirely.
 */
function splitIntoChunks(text: string): string[] {
  // Split on sentence-ending punctuation followed by a space or end-of-string.
  // Keep the punctuation attached to the sentence.
  const raw = text.match(/[^.!?]*[.!?]+[\s]?|[^.!?]+$/g);
  if (!raw) return [text];

  // Merge very short fragments (< 20 chars) with the previous chunk
  // so we don't fire dozens of tiny utterances for ellipsis-heavy text.
  const merged: string[] = [];
  for (const part of raw) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (merged.length > 0 && trimmed.length < 20) {
      merged[merged.length - 1] += ' ' + trimmed;
    } else {
      merged.push(trimmed);
    }
  }

  return merged.length > 0 ? merged : [text];
}

interface UseTTSOptions {
  isVocal: boolean;
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
  const cancelledRef = useRef(false);
  const isVocalizingRef = useRef(false);
  const greetingQueuedRef = useRef(false);

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

  const handleAudioEnd = useCallback(() => {
    isVocalizingRef.current = false;
    setIsVocalizing(false);
  }, []);

  const speakResponse = useCallback(
    async (text: string) => {
      if (!isVocal || !text || isVocalizingRef.current) return;
      isVocalizingRef.current = true;
      setIsVocalizing(true);
      cancelledRef.current = false;

      try {
        // Browser TTS path (free, instant)
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          // Split text into sentence-sized chunks to avoid Chrome's
          // long-utterance bug (silently stops after ~15s).
          const chunks = splitIntoChunks(text);

          for (const chunk of chunks) {
            if (cancelledRef.current) break;

            await new Promise<void>((resolve) => {
              try {
                window.speechSynthesis.cancel();

                const utterance = new SpeechSynthesisUtterance(chunk);
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

                // Per-chunk watchdog — generous but prevents infinite hangs
                const watchdog = window.setTimeout(() => {
                  if (didResolve) return;
                  didResolve = true;
                  try {
                    window.speechSynthesis.cancel();
                  } catch {
                    /* no-op */
                  }
                  resolve();
                }, 15_000);

                // Chrome mobile workaround: speechSynthesis can pause
                // indefinitely after ~15s. Resume it periodically.
                const resumeInterval = window.setInterval(() => {
                  if (
                    window.speechSynthesis.speaking &&
                    !window.speechSynthesis.paused
                  ) {
                    // noop — still going
                  } else if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                  }
                }, 5_000);

                utterance.onend = () => {
                  if (didResolve) return;
                  didResolve = true;
                  window.clearTimeout(watchdog);
                  window.clearInterval(resumeInterval);
                  resolve();
                };

                utterance.onerror = (event) => {
                  if (didResolve) return;
                  didResolve = true;
                  window.clearTimeout(watchdog);
                  window.clearInterval(resumeInterval);

                  if (event.error === 'not-allowed') {
                    // Browser blocked TTS because no user gesture yet.
                    // Queue the FULL text for replay after the first click/tap.
                    console.warn(
                      '[TTS] Autoplay blocked — queued for user gesture'
                    );
                    pendingTextRef.current = text;
                    setAutoplayBlocked(true);
                    cancelledRef.current = true; // stop remaining chunks
                  } else {
                    console.warn('[TTS] Browser TTS error:', event.error);
                  }

                  resolve();
                };

                window.speechSynthesis.speak(utterance);
              } catch (error) {
                console.error('[TTS] Browser TTS start failed:', error);
                resolve();
              }
            });
          }

          isVocalizingRef.current = false;
          setIsVocalizing(false);
          return;
        }

        // Fallback: server TTS (Gemini) — only if browser TTS unavailable
        const voiceResponse = await getMollyVoice(text);
        if (!voiceResponse.audioUri) {
          console.warn('Vocal cords returned no audio:', voiceResponse.error);
          isVocalizingRef.current = false;
          setIsVocalizing(false);
          return;
        }
        setAudioSrc(voiceResponse.audioUri);
      } catch (e) {
        console.error('Vocal error:', e);
        isVocalizingRef.current = false;
        setIsVocalizing(false);
      }
    },
    [isVocal]
  );

  // Play queued greeting on first user interaction (pointerdown).
  // Runs on every render (no dep array) so it picks up the greeting
  // even if the health-check resolves after initial mount.
  useEffect(() => {
    if (!greetingQueuedRef.current) return;

    const handleFirstInteraction = () => {
      hasUserGestureRef.current = true;
      const pending = pendingTextRef.current;
      if (pending && isVocal) {
        pendingTextRef.current = null;
        greetingQueuedRef.current = false;
        speakResponse(pending);
      }
    };

    window.addEventListener('pointerdown', handleFirstInteraction, {
      once: true,
    });
    return () =>
      window.removeEventListener('pointerdown', handleFirstInteraction);
  });

  /**
   * Queue the greeting text for playback on first user interaction.
   * Avoids browser autoplay policy entirely — never attempts speech
   * before a gesture. The text is stored and spoken when the user
   * first taps/clicks anywhere on the page.
   *
   * If the user has already interacted (tapped before greeting loaded),
   * speaks immediately.
   */
  const queueGreeting = useCallback(
    (text: string) => {
      if (!isVocal || !text) return;

      // User already tapped before greeting loaded — speak now
      if (hasUserGestureRef.current) {
        speakResponse(text);
        return;
      }

      pendingTextRef.current = text;
      greetingQueuedRef.current = true;
    },
    [isVocal, speakResponse]
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
      isVocalizingRef.current = false;
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
    queueGreeting,
    isVocalizing,
    autoplayBlocked,
    audioElement,
    unlockAutoplay,
  };
}
