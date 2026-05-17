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
  /** Attempt to unlock autoplay (call on user interaction). */
  unlockAutoplay: () => void;
}

export function useTTS({ isVocal, voiceName }: UseTTSOptions): UseTTSReturn {
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [isVocalizing, setIsVocalizing] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  // All browser TTS and gesture logic removed. Only server TTS is used.

  const handleAudioEnd = useCallback(() => {
    setIsVocalizing(false);
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
    async (text: string) => {
      if (!isVocal || !text) return;
      // Guard: cap spoken text to ~2000 chars (~300 words / ~2 min speech).
      const MAX_SPEAK_CHARS = 2000;
      const spokenText =
        text.length > MAX_SPEAK_CHARS
          ? text.substring(0, MAX_SPEAK_CHARS) +
            '... I wrote more in the chat window, but I will stop talking here so I do not ramble.'
          : text;
      setIsVocalizing(true);
      try {
        const voiceResponse = await getMollyVoice(spokenText, voiceName);
        if (!voiceResponse.audioUri) {
          // Server TTS failed, fallback to browser TTS
          console.warn('Server TTS failed, falling back to browser TTS:', voiceResponse.error);
          browserSpeak(spokenText);
          setIsVocalizing(false);
          return;
        }
        setAudioSrc(voiceResponse.audioUri);
      } catch (e) {
        // Network/server error, fallback to browser TTS
        console.error('Server TTS error, falling back to browser TTS:', e);
        browserSpeak(spokenText);
        setIsVocalizing(false);
      }
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
      } catch (_error) {
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
    unlockAutoplay,
  };
}
