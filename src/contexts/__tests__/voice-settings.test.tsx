import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

import {
  GEMINI_TTS_VOICES,
  VoiceSettingsProvider,
  useVoiceSettings,
} from '../voice-settings';

function VoiceSettingsConsumer() {
  const { selectedVoice, setSelectedVoice, availableVoices } =
    useVoiceSettings();

  return (
    <>
      <div data-testid="selected-voice">{selectedVoice}</div>
      <div data-testid="voice-count">{availableVoices.length}</div>
      <button type="button" onClick={() => setSelectedVoice('Puck')}>
        set-puck
      </button>
      <button type="button" onClick={() => setSelectedVoice('NotARealVoice')}>
        set-invalid
      </button>
    </>
  );
}

describe('VoiceSettingsProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('hydrates from a stored valid voice', () => {
    window.localStorage.setItem('molly-tts-voice', 'Puck');

    render(
      <VoiceSettingsProvider>
        <VoiceSettingsConsumer />
      </VoiceSettingsProvider>
    );

    expect(screen.getByTestId('selected-voice')).toHaveTextContent('Puck');
    expect(screen.getByTestId('voice-count')).toHaveTextContent(
      String(GEMINI_TTS_VOICES.length)
    );
  });

  it('persists valid voice updates and ignores invalid values', () => {
    render(
      <VoiceSettingsProvider>
        <VoiceSettingsConsumer />
      </VoiceSettingsProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'set-puck' }));
    expect(screen.getByTestId('selected-voice')).toHaveTextContent('Puck');
    expect(window.localStorage.getItem('molly-tts-voice')).toBe('Puck');

    fireEvent.click(screen.getByRole('button', { name: 'set-invalid' }));
    expect(screen.getByTestId('selected-voice')).toHaveTextContent('Puck');
    expect(window.localStorage.getItem('molly-tts-voice')).toBe('Puck');
  });
});
