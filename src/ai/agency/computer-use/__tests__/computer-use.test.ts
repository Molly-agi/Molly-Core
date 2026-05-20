/**
 * @fileOverview Computer Use Tests
 *
 * Tests for Molly's hands — screen capture, action execution, and the flow.
 */

import {
  denormalizeCoordinates,
  normalizeCoordinates,
  getEmergencyStop,
  triggerEmergencyStop,
  clearEmergencyStop,
  DEFAULT_CONFIG,
} from '../types';
import {
  MockScreenCaptureProvider,
  registerScreenCaptureProvider,
  getScreenCaptureProvider,
} from '../screen-capture';
import {
  MockActionExecutor,
  registerActionExecutor,
  getActionExecutor,
  executeAction,
} from '../action-executor';
import type { ComputerAction, ScreenDimensions } from '../types';

describe('Computer Use Types', () => {
  describe('Coordinate Conversion', () => {
    const screenDimensions: ScreenDimensions = { width: 1440, height: 900 };

    test('denormalizes center coordinates correctly', () => {
      const normalized = { x: 500, y: 500 };
      const result = denormalizeCoordinates(normalized, screenDimensions);
      expect(result.x).toBe(720); // 500/1000 * 1440
      expect(result.y).toBe(450); // 500/1000 * 900
    });

    test('denormalizes corner coordinates correctly', () => {
      const topLeft = denormalizeCoordinates({ x: 0, y: 0 }, screenDimensions);
      expect(topLeft.x).toBe(0);
      expect(topLeft.y).toBe(0);

      const bottomRight = denormalizeCoordinates(
        { x: 999, y: 999 },
        screenDimensions
      );
      expect(bottomRight.x).toBe(1439); // Rounded
      expect(bottomRight.y).toBe(899); // Rounded
    });

    test('normalizes screen coordinates correctly', () => {
      const screen = { x: 720, y: 450 };
      const result = normalizeCoordinates(screen, screenDimensions);
      expect(result.x).toBe(500);
      expect(result.y).toBe(500);
    });

    test('round trip conversion preserves approximate position', () => {
      const original = { x: 333, y: 666 };
      const denorm = denormalizeCoordinates(original, screenDimensions);
      const renorm = normalizeCoordinates(denorm, screenDimensions);
      // Allow for rounding differences
      expect(Math.abs(renorm.x - original.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(renorm.y - original.y)).toBeLessThanOrEqual(1);
    });
  });

  describe('Emergency Stop', () => {
    beforeEach(() => {
      clearEmergencyStop();
    });

    test('starts cleared', () => {
      const state = getEmergencyStop();
      expect(state.stopped).toBe(false);
    });

    test('can be triggered', () => {
      triggerEmergencyStop('Test emergency', 'system');
      const state = getEmergencyStop();
      expect(state.stopped).toBe(true);
      expect(state.reason).toBe('Test emergency');
      expect(state.triggeredBy).toBe('system');
      expect(state.triggeredAt).toBeDefined();
    });

    test('can be triggered by eric', () => {
      triggerEmergencyStop('Manual stop', 'eric');
      const state = getEmergencyStop();
      expect(state.triggeredBy).toBe('eric');
    });

    test('can be cleared', () => {
      triggerEmergencyStop('Test', 'system');
      clearEmergencyStop();
      const state = getEmergencyStop();
      expect(state.stopped).toBe(false);
    });

    test('returns copy of state', () => {
      const state1 = getEmergencyStop();
      const state2 = getEmergencyStop();
      expect(state1).not.toBe(state2); // Different objects
      expect(state1).toEqual(state2); // Same values
    });
  });

  describe('Default Config', () => {
    test('has sensible defaults', () => {
      expect(DEFAULT_CONFIG.sandboxMode).toBe(false); // Live by default
      expect(DEFAULT_CONFIG.defaultEnvironment).toBe('browser');
      expect(DEFAULT_CONFIG.maxStepsPerSession).toBe(100);
      expect(DEFAULT_CONFIG.actionTimeoutMs).toBe(30000);
      expect(DEFAULT_CONFIG.includeThinking).toBe(true);
    });
  });
});

describe('Screen Capture', () => {
  test('mock provider can be registered and retrieved', () => {
    const provider = new MockScreenCaptureProvider();
    registerScreenCaptureProvider(provider);

    const retrieved = getScreenCaptureProvider('browser');
    expect(retrieved).toBe(provider);
  });

  test('mock provider captures screenshot', async () => {
    const provider = new MockScreenCaptureProvider();
    const screenshot = await provider.capture();

    expect(screenshot.mimeType).toBe('image/png');
    expect(screenshot.data).toBeDefined();
    expect(screenshot.dimensions).toEqual({ width: 1440, height: 900 });
    expect(screenshot.url).toBe('https://example.com');
    expect(screenshot.timestamp).toBeDefined();
  });

  test('mock provider is always available', async () => {
    const provider = new MockScreenCaptureProvider();
    const available = await provider.isAvailable();
    expect(available).toBe(true);
  });

  test('mock provider can change dimensions', async () => {
    const provider = new MockScreenCaptureProvider();
    provider.setDimensions({ width: 1920, height: 1080 });

    const dimensions = await provider.getDimensions();
    expect(dimensions).toEqual({ width: 1920, height: 1080 });
  });

  test('mock provider can change URL', async () => {
    const provider = new MockScreenCaptureProvider();
    provider.setUrl('https://test.com');

    const url = await provider.getCurrentUrl();
    expect(url).toBe('https://test.com');
  });
});

describe('Action Executor', () => {
  beforeEach(() => {
    clearEmergencyStop();
  });

  test('mock executor can be registered and retrieved', () => {
    const executor = new MockActionExecutor();
    registerActionExecutor(executor);

    const retrieved = getActionExecutor('browser');
    expect(retrieved).toBe(executor);
  });

  test('mock executor executes click action', async () => {
    const executor = new MockActionExecutor();
    const action: ComputerAction = {
      name: 'click_at',
      args: { x: 500, y: 500 },
    };
    const dimensions: ScreenDimensions = { width: 1440, height: 900 };

    const result = await executor.execute(action, dimensions);
    expect(result.success).toBe(true);
    expect(result.executionTimeMs).toBeGreaterThan(0);
  });

  test('mock executor handles navigate action', async () => {
    const executor = new MockActionExecutor();
    const action: ComputerAction = {
      name: 'navigate',
      args: { url: 'https://google.com' },
    };
    const dimensions: ScreenDimensions = { width: 1440, height: 900 };

    const result = await executor.execute(action, dimensions);
    expect(result.success).toBe(true);
    expect(executor.getCurrentUrl()).toBe('https://google.com');
  });

  test('executeAction respects emergency stop', async () => {
    const executor = new MockActionExecutor();
    registerActionExecutor(executor);

    triggerEmergencyStop('Test stop', 'system');

    const action: ComputerAction = {
      name: 'click_at',
      args: { x: 500, y: 500 },
    };
    const dimensions: ScreenDimensions = { width: 1440, height: 900 };

    const result = await executeAction(
      action,
      'browser',
      dimensions,
      'test-session',
      'test-step',
      false
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Emergency stop active');
  });

  test('executeAction skips execution in sandbox mode', async () => {
    const executor = new MockActionExecutor();
    registerActionExecutor(executor);

    const action: ComputerAction = {
      name: 'navigate',
      args: { url: 'https://dangerous-site.com' },
    };
    const dimensions: ScreenDimensions = { width: 1440, height: 900 };

    const result = await executeAction(
      action,
      'browser',
      dimensions,
      'test-session',
      'test-step',
      true // sandbox mode
    );

    expect(result.success).toBe(true);
    // URL should NOT have changed because action wasn't actually executed
    expect(executor.getCurrentUrl()).not.toBe('https://dangerous-site.com');
  });

  test('executeAction denormalizes coordinates', async () => {
    const executor = new MockActionExecutor();
    registerActionExecutor(executor);

    // We can't easily verify denormalization in mock, but we can verify it doesn't crash
    const action: ComputerAction = {
      name: 'click_at',
      args: { x: 500, y: 500 }, // Normalized
    };
    const dimensions: ScreenDimensions = { width: 1440, height: 900 };

    const result = await executeAction(
      action,
      'browser',
      dimensions,
      'test-session',
      'test-step',
      false
    );

    expect(result.success).toBe(true);
  });
});
