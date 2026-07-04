// src/ai/inference/qwen-chat-template.ts
//
// Qwen 2.5 Instruct chat template. Mirrors the official Jinja template:
//   <|im_start|>system\n{system}\n<|im_end|>\n
//   <|im_start|>user\n{user}\n<|im_end|>\n
//   <|im_start|>assistant\n{assistant}\n<|im_end|>\n
//   <|im_start|>assistant\n    ← generation prompt (no closing tag)
//
// Default system prompt matches HF's tokenizer_config.json.

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

const DEFAULT_SYSTEM =
  'You are Qwen, created by Alibaba Cloud. You are a helpful assistant.';

export function applyQwenChatTemplate(
  messages: ChatTurn[],
  addGenerationPrompt = true
): string {
  const parts: string[] = [];

  // System first — inject default if caller didn't provide one
  const first = messages[0];
  if (first && first.role === 'system') {
    parts.push(`<|im_start|>system\n${first.content}\n<|im_end|>\n`);
  } else {
    parts.push(`<|im_start|>system\n${DEFAULT_SYSTEM}\n<|im_end|>\n`);
  }

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (i === 0 && msg.role === 'system') continue;
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    parts.push(`<|im_start|>${msg.role}\n${msg.content}\n<|im_end|>\n`);
  }

  if (addGenerationPrompt) {
    parts.push('<|im_start|>assistant\n');
  }

  return parts.join('');
}

// Streaming stop condition — detect <|im_end|> in decoded output
export const IM_END = '<|im_end|>';
export const IM_START = '<|im_start|>';
