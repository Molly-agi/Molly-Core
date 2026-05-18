'use client';
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';

interface VoiceSettingsContextType {
  selectedVoice: string;
  setSelectedVoice: (voice: string) => void;
  availableVoices: string[];
}

const VoiceSettingsContext = createContext<
  VoiceSettingsContextType | undefined
>(undefined);

const DEFAULT_VOICE = 'Aoede';
const VOICE_STORAGE_KEY = 'molly-tts-voice';

function isGeminiVoice(voice: string | null): voice is string {
  return voice !== null && GEMINI_TTS_VOICES.includes(voice);
}

function getStoredVoice() {
  if (typeof window === 'undefined') {
    return DEFAULT_VOICE;
  }

  const stored = window.localStorage.getItem(VOICE_STORAGE_KEY);
  return isGeminiVoice(stored) ? stored : DEFAULT_VOICE;
}

function subscribeToVoiceChanges(onStoreChange: () => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === VOICE_STORAGE_KEY) {
      onStoreChange();
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('molly-tts-voice-change', onStoreChange);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('molly-tts-voice-change', onStoreChange);
  };
}

export const GEMINI_TTS_VOICES = [
  'Aoede', // Warm, strategic, feminine (default)
  'Puck', // Playful, energetic
  'Charon', // Deep, commanding
  'Fenrir', // Intense, dramatic
  'Kore', // Ethereal, mystical
];

export function VoiceSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const selectedVoice = useSyncExternalStore(
    subscribeToVoiceChanges,
    getStoredVoice,
    () => DEFAULT_VOICE
  );

  const setSelectedVoice = useCallback((voice: string) => {
    if (isGeminiVoice(voice) && typeof window !== 'undefined') {
      window.localStorage.setItem(VOICE_STORAGE_KEY, voice);
      window.dispatchEvent(new Event('molly-tts-voice-change'));
    }
  }, []);

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
