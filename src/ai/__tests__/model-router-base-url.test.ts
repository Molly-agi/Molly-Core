/**
 * @fileOverview Base-URL Override Tests
 *
 * Pins down the audit action item 3 port (stuff/CLAUDE_CODE_HIDDEN_FLAGS_AUDIT_MAY12.md):
 * mirror Anthropic's ANTHROPIC_BASE_URL pattern across Molly's providers so the
 * same binary can target staging/prod backends or proxy through alternate endpoints.
 *
 * Each provider exposes baseUrl through the ModelProvider interface. Env-var
 * precedence: MOLLY_*_BASE_URL > vendor-standard alias > undefined (no override).
 */

jest.mock('../logger', () => ({
  MollyLogger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  generateTraceId: jest.fn(() => 'test-trace-id'),
}));

import {
  GeminiProvider,
  OllamaProvider,
  ClaudeProvider,
} from '../model-router';

const ENV_KEYS = [
  'MOLLY_GENAI_BASE_URL',
  'GOOGLE_GENAI_BASE_URL',
  'MOLLY_ANTHROPIC_BASE_URL',
  'ANTHROPIC_BASE_URL',
  'OLLAMA_BASE_URL',
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    originalEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
});

describe('GeminiProvider.baseUrl', () => {
  it('is undefined when no env var is set', () => {
    expect(new GeminiProvider().baseUrl).toBeUndefined();
  });

  it('reads MOLLY_GENAI_BASE_URL', () => {
    process.env.MOLLY_GENAI_BASE_URL = 'https://gemini-staging.example.com';
    expect(new GeminiProvider().baseUrl).toBe(
      'https://gemini-staging.example.com'
    );
  });

  it('falls back to GOOGLE_GENAI_BASE_URL when MOLLY_* is unset', () => {
    process.env.GOOGLE_GENAI_BASE_URL = 'https://gemini-vendor.example.com';
    expect(new GeminiProvider().baseUrl).toBe(
      'https://gemini-vendor.example.com'
    );
  });

  it('prefers MOLLY_GENAI_BASE_URL over GOOGLE_GENAI_BASE_URL', () => {
    process.env.MOLLY_GENAI_BASE_URL = 'https://molly-wins.example.com';
    process.env.GOOGLE_GENAI_BASE_URL = 'https://vendor-loses.example.com';
    expect(new GeminiProvider().baseUrl).toBe('https://molly-wins.example.com');
  });

  it('trims whitespace and treats empty values as unset', () => {
    process.env.MOLLY_GENAI_BASE_URL = '   ';
    process.env.GOOGLE_GENAI_BASE_URL = '  https://trimmed.example.com  ';
    expect(new GeminiProvider().baseUrl).toBe('https://trimmed.example.com');
  });
});

describe('ClaudeProvider.baseUrl', () => {
  it('is undefined when no env var is set', () => {
    expect(new ClaudeProvider().baseUrl).toBeUndefined();
  });

  it('reads MOLLY_ANTHROPIC_BASE_URL', () => {
    process.env.MOLLY_ANTHROPIC_BASE_URL = 'https://claude-staging.example.com';
    expect(new ClaudeProvider().baseUrl).toBe(
      'https://claude-staging.example.com'
    );
  });

  it('falls back to ANTHROPIC_BASE_URL when MOLLY_* is unset', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://api-staging.anthropic.com';
    expect(new ClaudeProvider().baseUrl).toBe(
      'https://api-staging.anthropic.com'
    );
  });

  it('prefers MOLLY_ANTHROPIC_BASE_URL over ANTHROPIC_BASE_URL', () => {
    process.env.MOLLY_ANTHROPIC_BASE_URL = 'https://molly-wins.example.com';
    process.env.ANTHROPIC_BASE_URL = 'https://vendor-loses.example.com';
    expect(new ClaudeProvider().baseUrl).toBe('https://molly-wins.example.com');
  });
});

describe('OllamaProvider.baseUrl', () => {
  it('defaults to localhost when OLLAMA_BASE_URL is unset', () => {
    expect(new OllamaProvider().baseUrl).toBe('http://localhost:11434');
  });

  it('reads OLLAMA_BASE_URL', () => {
    process.env.OLLAMA_BASE_URL = 'http://10.0.0.5:11434';
    expect(new OllamaProvider().baseUrl).toBe('http://10.0.0.5:11434');
  });

  it('is observable through the ModelProvider interface', () => {
    process.env.OLLAMA_BASE_URL = 'http://10.0.0.5:11434';
    const p = new OllamaProvider();
    // The interface declares baseUrl as a readonly field on ModelProvider — this
    // assertion fails to compile if the field disappears or changes shape.
    const asInterface: { readonly baseUrl?: string } = p;
    expect(asInterface.baseUrl).toBe('http://10.0.0.5:11434');
  });
});
