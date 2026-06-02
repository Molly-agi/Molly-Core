/**
 * @fileOverview Tab Keep-Alive Hook
 *
 * Prevents Android Chrome from suspending the tab and killing WebSocket.
 * Uses two layers:
 *
 * Layer 1 — Screen Wake Lock API (preferred, no tricks needed):
 *   navigator.wakeLock.request('screen') tells the browser to keep the tab
 *   alive and the screen on. Works in Android Chrome 84+. Auto-reacquires
 *   when tab becomes visible again (Chrome releases it on visibility-hidden).
 *
 * Layer 2 — Silent audio fallback (older browsers / when wake lock unavailable):
 *   Plays inaudible 1Hz oscillator at near-zero gain. Tricks the browser into
 *   treating the tab as active media.
 *
 * Used by: VS Code web (Codespaces) to maintain connection
 * Critical for: Android Chrome which aggressively kills background tabs
 */

// ---- Wake Lock layer ----
let wakeLock: WakeLockSentinel | null = null;
let wakeLockActive = false;

async function requestWakeLock(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return false;
  try {
    wakeLock = await (navigator as Navigator & { wakeLock: { request(type: string): Promise<WakeLockSentinel> } }).wakeLock.request('screen');
    wakeLockActive = true;
    wakeLock.addEventListener('release', () => {
      wakeLockActive = false;
      wakeLock = null;
      console.log('[KeepAlive] Wake lock released by browser');
    });
    console.log('[KeepAlive] Screen Wake Lock acquired — tab cannot be suspended');
    return true;
  } catch (err) {
    console.warn('[KeepAlive] Wake Lock unavailable:', err);
    return false;
  }
}

async function releaseWakeLock(): Promise<void> {
  if (wakeLock) {
    await wakeLock.release().catch(() => {});
    wakeLock = null;
    wakeLockActive = false;
  }
}

// Reacquire wake lock when tab becomes visible (browser releases it on hide)
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockActive === false && isPlaying) {
      requestWakeLock().catch(() => {});
    }
  });
}

// ---- Silent audio layer (fallback) ----
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
 * Start the keep-alive system.
 * Layer 1: Screen Wake Lock (prevents tab suspension natively).
 * Layer 2: Silent audio (fallback for browsers without Wake Lock support).
 */
export function startTabKeepAlive(): boolean {
  if (isPlaying) return true;

  // Layer 1: Try Wake Lock first — this is the real fix for Android Chrome
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
    requestWakeLock().then((acquired) => {
      if (acquired) {
        console.log('[KeepAlive] Wake Lock active — tab will not be suspended');
      }
    }).catch(() => {});
  }

  try {
    // Layer 2: Silent audio fallback
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
 * Stop the keep-alive system — both Wake Lock and silent audio.
 */
export function stopTabKeepAlive(): void {
  if (!isPlaying) return;

  // Release Wake Lock
  releaseWakeLock().catch(() => {});

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
