'use client';
import { createContext, useContext, useState, useEffect } from 'react';

interface VoiceSettingsContextType {
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  availableVoices: string[];
}

const VoiceSettingsContext = createContext<VoiceSettingsContextType | undefined>(
  undefined
);

export const GEMINI_TTS_VOICES = [
  'Aoede',      // Warm, strategic, feminine (default)
  'Puck',       // Playful, energetic
  'Charon',     // Deep, commanding
  'Fenrir',     // Intense, dramatic
  'Kore',       // Ethereal, mystical
];

export function VoiceSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [selectedVoice, setSelectedVoiceState] = useState<string>('Aoede');
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('molly-tts-voice');
    if (stored && GEMINI_TTS_VOICES.includes(stored)) {
      setSelectedVoiceState(stored);
    }
    setMounted(true);
  }, []);

  const setSelectedVoice = (voice: string) => {
    if (GEMINI_TTS_VOICES.includes(voice)) {
      setSelectedVoiceState(voice);
      localStorage.setItem('molly-tts-voice', voice);
    }
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <VoiceSettingsContext.Provider
      value={{
        selectedVoice,
        setSelectedVoice,
        availableVoices: GEMINI_TTS_VOICES,
      }}
    >
      {children}
    </VoiceSettingsContext.Provider>
  );
}

export function useVoiceSettings() {
  const context = useContext(VoiceSettingsContext);
  if (!context) {
    throw new Error(
      'useVoiceSettings must be used within VoiceSettingsProvider'
    );
  }
  return context;
}
