/**
 * @fileOverview Tab Keep-Alive Hook
 *
 * Prevents browser from suspending the tab by playing inaudible audio.
 * This tricks the browser into thinking media is playing, so it won't
 * kill WebSocket connections when you switch to another tab.
 *
 * Used by: VS Code web (Codespaces) to maintain connection
 */

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let isPlaying = false;

/**
 * Start the silent audio heartbeat.
 * Creates inaudible audio that keeps the tab active.
 */
export function startTabKeepAlive(): boolean {
  if (isPlaying) return true;

  try {
    // Create audio context (lazy init to handle autoplay policies)
    audioContext = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    )();

    // Create oscillator (generates the "sound")
    oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1, audioContext.currentTime); // 1Hz - completely inaudible

    // Create gain node and set to zero (silent)
    gainNode = audioContext.createGain();
    gainNode.gain.setValueAtTime(0.00001, audioContext.currentTime); // Nearly zero but not quite (some browsers detect true zero)

    // Connect: oscillator -> gain -> output
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Start the oscillator
    oscillator.start();
    isPlaying = true;

    console.log('[KeepAlive] Silent audio heartbeat started');
    return true;
  } catch (error) {
    console.error('[KeepAlive] Failed to start:', error);
    return false;
  }
}

/**
 * Stop the silent audio heartbeat.
 */
export function stopTabKeepAlive(): void {
  if (!isPlaying) return;

  try {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    isPlaying = false;
    console.log('[KeepAlive] Silent audio heartbeat stopped');
  } catch (error) {
    console.error('[KeepAlive] Failed to stop:', error);
  }
}

/**
 * Check if keep-alive is currently active.
 */
export function isTabKeepAliveActive(): boolean {
  return isPlaying;
}

/**
 * Toggle keep-alive on/off.
 */
export function toggleTabKeepAlive(): boolean {
  if (isPlaying) {
    stopTabKeepAlive();
    return false;
  } else {
    return startTabKeepAlive();
  }
}
