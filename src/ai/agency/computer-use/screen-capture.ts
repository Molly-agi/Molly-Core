/**
 * @fileOverview Screen Capture Interface — Molly's Eyes for Computer Use
 *
 * Abstract interface for capturing screenshots from any environment.
 * Implementations exist for browser (Playwright), Android (ADB), etc.
 */

import { Screenshot, ScreenDimensions, Environment } from './types';

/**
 * Interface for screen capture providers.
 * Implement this to add support for a new environment.
 */
export interface ScreenCaptureProvider {
  /** Environment this provider handles */
  readonly environment: Environment;

  /**
   * Capture the current screen.
   * Returns PNG screenshot with metadata.
   */
  capture(): Promise<Screenshot>;

  /**
   * Get current screen dimensions.
   */
  getDimensions(): Promise<ScreenDimensions>;

  /**
   * Get current URL (browser only).
   */
  getCurrentUrl?(): Promise<string | undefined>;

  /**
   * Check if provider is available/initialized.
   */
  isAvailable(): Promise<boolean>;

  /**
   * Initialize the provider (e.g., launch browser).
   */
  initialize?(): Promise<void>;

  /**
   * Clean up resources.
   */
  cleanup?(): Promise<void>;
}

/**
 * Registry of screen capture providers.
 */
const _providers: Map<Environment, ScreenCaptureProvider> = new Map();

/**
 * Register a screen capture provider.
 */
export function registerScreenCaptureProvider(
  provider: ScreenCaptureProvider
): void {
  _providers.set(provider.environment, provider);
}

/**
 * Get a screen capture provider for an environment.
 */
export function getScreenCaptureProvider(
  environment: Environment
): ScreenCaptureProvider | undefined {
  return _providers.get(environment);
}

/**
 * Get all registered providers.
 */
export function getAvailableProviders(): ScreenCaptureProvider[] {
  return Array.from(_providers.values());
}

/**
 * Mock screen capture provider for testing.
 * Returns a simple placeholder screenshot.
 */
export class MockScreenCaptureProvider implements ScreenCaptureProvider {
  readonly environment: Environment = 'browser';
  private dimensions: ScreenDimensions = { width: 1440, height: 900 };
  private url: string = 'https://example.com';

  async capture(): Promise<Screenshot> {
    // Return a minimal valid PNG (1x1 transparent pixel)
    const minimalPng = Buffer.from([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a, // PNG signature
      0x00,
      0x00,
      0x00,
      0x0d,
      0x49,
      0x48,
      0x44,
      0x52, // IHDR chunk
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x01,
      0x08,
      0x06,
      0x00,
      0x00,
      0x00,
      0x1f,
      0x15,
      0xc4,
      0x89,
      0x00,
      0x00,
      0x00,
      0x0b,
      0x49,
      0x44,
      0x41, // IDAT chunk
      0x54,
      0x78,
      0x9c,
      0x63,
      0x00,
      0x01,
      0x00,
      0x00,
      0x05,
      0x00,
      0x01,
      0x0d,
      0x0a,
      0x2d,
      0xb4,
      0x00,
      0x00,
      0x00,
      0x00,
      0x49,
      0x45,
      0x4e,
      0x44,
      0xae, // IEND chunk
      0x42,
      0x60,
      0x82,
    ]);

    return {
      data: minimalPng,
      mimeType: 'image/png',
      dimensions: this.dimensions,
      url: this.url,
      timestamp: Date.now(),
    };
  }

  async getDimensions(): Promise<ScreenDimensions> {
    return this.dimensions;
  }

  async getCurrentUrl(): Promise<string | undefined> {
    return this.url;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  setDimensions(dimensions: ScreenDimensions): void {
    this.dimensions = dimensions;
  }

  setUrl(url: string): void {
    this.url = url;
  }
}
