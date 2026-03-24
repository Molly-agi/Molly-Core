/**
 * @fileOverview Tab Keep-Alive Hook
 *
 * Prevents browser from suspending the tab by playing inaudible audio.
 * This tricks the browser into thinking media is playing, so it won't
 * kill WebSocket connections when you switch to another tab.
 *
 * Used by: VS Code web (Codespaces) to maintain connection
 * Critical for: Android Chrome which aggressively kills background tabs
 */

let audioContext: AudioContext | null = null;
let oscillator: OscillatorNode | null = null;
let gainNode: GainNode | null = null;
let isPlaying = false;

/**
 * Detect if we're on a mobile device (Android/iOS)
 */
function isMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

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

let autoInitialized = false;

/**
 * Auto-initialize keep-alive - AGGRESSIVE on mobile, interaction-based on desktop.
 * On Android, we MUST start before user tabs out or the WebSocket dies.
 * Call this once on app load.
 */
export function autoInitKeepAlive(): void {
  if (autoInitialized || typeof window === 'undefined') return;
  autoInitialized = true;

  const mobile = isMobile();

  // On mobile, try to start immediately
  if (mobile) {
    console.log('[KeepAlive] Mobile detected - attempting immediate start');

    // Try starting right away
    const started = startTabKeepAlive();
    if (started) {
      console.log('[KeepAlive] Mobile keepalive active - safe to tab out');
      return;
    }

    // If blocked by autoplay policy, the AudioContext will be in 'suspended' state
    // Resume it on the first interaction
    if (audioContext && audioContext.state === 'suspended') {
      console.log(
        '[KeepAlive] AudioContext suspended - waiting for interaction to resume'
      );

      const resume = async () => {
        if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume();
          console.log(
            '[KeepAlive] AudioContext resumed - mobile keepalive now active'
          );
        }
        window.removeEventListener('touchstart', resume);
        window.removeEventListener('click', resume);
      };

      window.addEventListener('touchstart', resume, {
        once: true,
        passive: true,
      });
      window.addEventListener('click', resume, { once: true, passive: true });
    }
    return;
  }

  // Desktop: wait for first user interaction (standard autoplay bypass)
  const activate = () => {
    if (!isPlaying) {
      const started = startTabKeepAlive();
      if (started) {
        console.log('[KeepAlive] Auto-activated on user interaction');
      }
    }
    // Clean up listeners after first activation
    window.removeEventListener('click', activate);
    window.removeEventListener('touchstart', activate);
    window.removeEventListener('keydown', activate);
  };

  // Listen for any user interaction
  window.addEventListener('click', activate, { once: true, passive: true });
  window.addEventListener('touchstart', activate, {
    once: true,
    passive: true,
  });
  window.addEventListener('keydown', activate, { once: true, passive: true });

  console.log('[KeepAlive] Desktop mode - waiting for first user interaction');
}

/**
 * Handle visibility change - restart keepalive if it died while backgrounded.
 * Call this from visibilitychange event handler.
 */
export function handleVisibilityChange(): void {
  if (typeof document === 'undefined') return;

  if (!document.hidden && autoInitialized) {
    // Tab became visible - check if keepalive is still running
    if (audioContext && audioContext.state === 'suspended') {
      console.log('[KeepAlive] Tab visible - resuming suspended AudioContext');
      audioContext.resume().catch((err) => {
        console.error('[KeepAlive] Failed to resume:', err);
      });
    } else if (!isPlaying && isMobile()) {
      // On mobile, try restarting if it died
      console.log('[KeepAlive] Tab visible - restarting keepalive');
      startTabKeepAlive();
    }
  }
}
