/**
 * @fileOverview Termux Bridge Client
 *
 * Browser-side client that connects to the Termux Relay Server
 * running on the same device (or same LAN). This is how Molly
 * reaches into the real device — same pattern as the camera
 * uses navigator.mediaDevices.
 *
 * Works on any Android phone with Termux installed.
 * Also works on desktop/laptop if the relay is running locally.
 */

export interface TermuxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs?: number;
  language?: string;
}

export interface TermuxDeviceInfo {
  platform?: string;
  python?: string;
  relay_version?: string;
  device_model?: string;
  architecture?: string;
  battery?: {
    percentage: number;
    status: string;
    temperature: number;
  };
  timestamp?: number;
}

export interface TermuxBridgeConfig {
  /** Relay server URL (default: http://localhost:8023) */
  relayUrl: string;
  /** Auth token (must match MOLLY_RELAY_TOKEN on the relay) */
  token: string;
  /** Command timeout in seconds (default: 30) */
  timeout: number;
}

const DEFAULT_CONFIG: TermuxBridgeConfig = {
  relayUrl: 'http://localhost:8023',
  token: 'molly-local-dev',
  timeout: 30,
};

/**
 * Get the current bridge config from localStorage + defaults.
 * Users can configure the relay URL if running on a different port/device.
 */
export function getBridgeConfig(): TermuxBridgeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;

  try {
    const saved = localStorage.getItem('molly-termux-config');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {
    // corrupt localStorage — use defaults
  }

  return DEFAULT_CONFIG;
}

/**
 * Save bridge config to localStorage.
 */
export function saveBridgeConfig(config: Partial<TermuxBridgeConfig>): void {
  if (typeof window === 'undefined') return;
  const current = getBridgeConfig();
  const merged = { ...current, ...config };
  localStorage.setItem('molly-termux-config', JSON.stringify(merged));
}

/**
 * Check if the Termux relay is reachable.
 * Uses /ping endpoint (no auth required).
 */
export async function isTermuxAvailable(): Promise<boolean> {
  const config = getBridgeConfig();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`${config.relayUrl}/ping`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) return false;

    const data = await response.json();
    return data.relay === 'molly-termux';
  } catch {
    return false;
  }
}

/**
 * Get device info from the relay.
 */
export async function getTermuxDeviceInfo(): Promise<TermuxDeviceInfo | null> {
  const config = getBridgeConfig();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${config.relayUrl}/info`, {
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Execute a command on the Termux relay.
 * This is the core bridge — Molly sends a command, Termux runs it,
 * output comes back to the browser.
 */
export async function execTermux(
  command: string,
  language: 'shell' | 'python' | 'javascript' = 'shell',
  timeout?: number
): Promise<TermuxExecResult> {
  const config = getBridgeConfig();
  const execTimeout = timeout || config.timeout;

  try {
    const controller = new AbortController();
    // Give extra buffer beyond command timeout for network overhead
    const timeoutId = setTimeout(
      () => controller.abort(),
      (execTimeout + 5) * 1000
    );

    const response = await fetch(`${config.relayUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        command,
        language,
        timeout: execTimeout,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        stdout: '',
        stderr: error.error || `Relay returned ${response.status}`,
        exitCode: 1,
      };
    }

    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        stdout: '',
        stderr: `Command timed out after ${execTimeout}s (network)`,
        exitCode: 124,
      };
    }

    return {
      stdout: '',
      stderr:
        error instanceof Error
          ? `Termux relay unreachable: ${error.message}`
          : 'Termux relay unreachable',
      exitCode: 1,
    };
  }
}
