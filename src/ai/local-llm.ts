/**
 * @fileOverview Local LLM — Direct Ollama HTTP shim
 *
 * Crystal OS direction: bypass Genkit entirely.
 * Talks directly to localhost:11434 (Ollama API).
 * No Google. No API keys. No cloud. Fully sovereign.
 *
 * Drop-in for flows that currently call ai.generate().
 * Usage:
 *   import { localGenerate, localGenerateStream } from '@/ai/local-llm';
 *   const response = await localGenerate({ prompt: 'Hello Molly' });
 */

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'deepseek-r1:14b';
const FALLBACK_MODEL = 'qwen2.5:3b';

export interface LocalGenerateOptions {
  prompt: string;
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** History for multi-turn conversation */
  messages?: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
}

export interface LocalGenerateResult {
  text: string;
  model: string;
  thinking?: string; // DeepSeek R1 chain-of-thought
  promptTokens?: number;
  completionTokens?: number;
}

/**
 * Check if Ollama is running and a model is available.
 */
export async function isOllamaReady(model?: string): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { models: Array<{ name: string }> };
    const target = model || DEFAULT_MODEL;
    return data.models.some(
      (m) => m.name === target || m.name.startsWith(target.split(':')[0])
    );
  } catch {
    return false;
  }
}

/**
 * Single-turn or multi-turn generation via Ollama.
 * Automatically falls back to FALLBACK_MODEL if DEFAULT_MODEL not available.
 */
export async function localGenerate(
  options: LocalGenerateOptions
): Promise<LocalGenerateResult> {
  const {
    prompt,
    system,
    model,
    temperature = 0.7,
    maxTokens,
    messages,
  } = options;

  // Build message array
  const msgs: Array<{ role: string; content: string }> = [];
  if (system) msgs.push({ role: 'system', content: system });
  if (messages) msgs.push(...messages);
  if (prompt) msgs.push({ role: 'user', content: prompt });

  const targetModel = model || DEFAULT_MODEL;

  const body = {
    model: targetModel,
    messages: msgs,
    stream: false,
    options: {
      temperature,
      ...(maxTokens ? { num_predict: maxTokens } : {}),
    },
  };

  let res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  // Auto-fallback to smaller model if primary not available
  if (!res.ok && targetModel !== FALLBACK_MODEL) {
    console.warn(
      `[local-llm] ${targetModel} unavailable, falling back to ${FALLBACK_MODEL}`
    );
    body.model = FALLBACK_MODEL;
    res = await fetch(`${OLLAMA_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  }

  if (!res.ok) {
    throw new Error(
      `[local-llm] Ollama request failed: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as {
    message: { content: string };
    model: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  const rawContent = data.message.content;

  // Extract DeepSeek R1 chain-of-thought from <think>...</think> tags
  let thinking: string | undefined;
  let text = rawContent;
  const thinkMatch = rawContent.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinking = thinkMatch[1].trim();
    text = rawContent.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  }

  return {
    text,
    model: data.model,
    thinking,
    promptTokens: data.prompt_eval_count,
    completionTokens: data.eval_count,
  };
}

/**
 * Streaming generation via Ollama.
 * Yields text chunks as they arrive.
 */
export async function* localGenerateStream(
  options: LocalGenerateOptions
): AsyncGenerator<string> {
  const { prompt, system, model, temperature = 0.7, messages } = options;

  const msgs: Array<{ role: string; content: string }> = [];
  if (system) msgs.push({ role: 'system', content: system });
  if (messages) msgs.push(...messages);
  if (prompt) msgs.push({ role: 'user', content: prompt });

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      messages: msgs,
      stream: true,
      options: { temperature },
    }),
  });

  if (!res.ok || !res.body) {
    throw new Error(`[local-llm] Stream failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let inThinkBlock = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const lines = decoder.decode(value).split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const chunk = JSON.parse(line) as {
          message?: { content: string };
          done?: boolean;
        };
        if (chunk.message?.content) {
          const content = chunk.message.content;
          // Skip DeepSeek R1 think blocks in stream
          if (content.includes('<think>')) inThinkBlock = true;
          if (content.includes('</think>')) {
            inThinkBlock = false;
            continue;
          }
          if (!inThinkBlock) yield content;
        }
      } catch {
        // malformed chunk, skip
      }
    }
  }
}
