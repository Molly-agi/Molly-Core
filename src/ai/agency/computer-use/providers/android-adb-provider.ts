/**
 * @fileOverview Android ADB Provider for Molly's Computer Use
 *
 * Implements both ScreenCaptureProvider and ActionExecutorProvider
 * to give Molly physical control over the Android host device via the
 * Termux Relay Bridge and ADB.
 * 
 * Note: This is scaffolded for the future "Phase 6" physical embodiment.
 * It expects the relay server (http://localhost:8023) to have ADB access.
 */

import { MollyLogger } from '../../../logger';
import {
  ComputerAction,
  ScreenDimensions,
  Environment,
  Screenshot,
} from '../types';
import type { ActionExecutorProvider, ActionResult } from '../action-executor';
import type { ScreenCaptureProvider } from '../screen-capture';

export class AndroidADBProvider
  implements ScreenCaptureProvider, ActionExecutorProvider
{
  readonly environment: Environment = 'android';
  
  // Dimensions will be updated dynamically on first capture
  private dimensions: ScreenDimensions = { width: 1080, height: 2400 };
  private relayUrl = process.env.TERMUX_RELAY_URL || 'http://localhost:8023';
  private token = process.env.MOLLY_RELAY_TOKEN || 'molly-local-dev';

  async initialize(): Promise<void> {
    MollyLogger.info('Initializing Android ADB Provider', 'computer-use');
    // In the future, this might ping the relay to ensure ADB is connected
  }

  async cleanup(): Promise<void> {
    // Nothing to clean up locally for REST relay
  }

  async isAvailable(): Promise<boolean> {
    // Check if the relay server is responsive
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.relayUrl}/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- Helper to send shell commands to Relay ---
  private async execAdb(command: string): Promise<string> {
    const response = await fetch(`${this.relayUrl}/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        command: `adb shell ${command}`,
        language: 'shell',
        timeout: 10,
      }),
    });

    if (!response.ok) {
      throw new Error(`ADB relay failed: ${response.status}`);
    }

    const result = await response.json();
    if (result.exitCode !== 0) {
      throw new Error(`ADB command failed: ${result.stderr}`);
    }
    return result.stdout;
  }

  // --- Screen Capture Implementation ---

  async capture(): Promise<Screenshot> {
    // FUTURE IMPLEMENTATION:
    // 1. execAdb('screencap -p > /sdcard/screen.png')
    // 2. Fetch the file via the relay
    // 3. Return as base64 JPEG
    
    throw new Error('Android Screen Capture not yet implemented on the Relay Server.');
  }

  async getDimensions(): Promise<ScreenDimensions> {
    return this.dimensions;
  }

  async getCurrentUrl(): Promise<string | undefined> {
    // Android doesn't have a single URL concept unless we query the active browser
    return undefined;
  }

  // --- Action Executor Implementation ---

  async execute(action: ComputerAction, _dimensions: ScreenDimensions): Promise<ActionResult> {
    const startTime = performance.now();
    const args = action.args as Record<string, unknown>;
    
    try {
      switch (action.name) {
        case 'click_at':
          if (args.x === undefined || args.y === undefined) throw new Error('Missing coordinates');
          // adb shell input tap x y
          await this.execAdb(`input tap ${args.x} ${args.y}`);
          break;

        case 'type_text_at':
          if (args.x === undefined || args.y === undefined || args.text === undefined) throw new Error('Missing args');
          await this.execAdb(`input tap ${args.x} ${args.y}`);
          // ADB input text doesn't handle spaces well unless quoted
          const safeText = String(args.text).replace(/"/g, '\\"');
          await this.execAdb(`input text "${safeText}"`);
          break;

        case 'key_combination':
          // adb shell input keyevent <keycode>
          if (args.keys === 'Enter') await this.execAdb('input keyevent 66');
          if (args.keys === 'Backspace') await this.execAdb('input keyevent 67');
          if (args.keys === 'Home') await this.execAdb('input keyevent 3');
          if (args.keys === 'Back') await this.execAdb('input keyevent 4');
          break;

        case 'scroll_document':
        case 'scroll_at':
          // adb shell input swipe x1 y1 x2 y2 duration
          const dir = args.direction || 'down';
          const cx = this.dimensions.width / 2;
          const cy = this.dimensions.height / 2;
          if (dir === 'down') await this.execAdb(`input swipe ${cx} ${cy + 300} ${cx} ${cy - 300} 300`);
          if (dir === 'up') await this.execAdb(`input swipe ${cx} ${cy - 300} ${cx} ${cy + 300} 300`);
          break;

        case 'go_back':
          await this.execAdb('input keyevent 4'); // Android Back button
          break;

        case 'wait_5_seconds':
          await new Promise(r => setTimeout(r, 5000));
          break;

        default:
          throw new Error(`Unsupported action on Android: ${action.name}`);
      }

      return {
        success: true,
        executionTimeMs: performance.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        executionTimeMs: performance.now() - startTime,
      };
    }
  }
}
