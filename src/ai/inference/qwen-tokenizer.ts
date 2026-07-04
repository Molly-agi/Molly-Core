// src/ai/inference/qwen-tokenizer.ts
//
// Pure-JS BPE tokenizer for Qwen 2.5 (152,064 vocab).
// Format: HuggingFace tokenizer.json (not tiktoken .bpe).
//
// Pipeline:
//   encode: text
//     → UTF-8 bytes
//     → GPT-2 byte-to-unicode map (each byte → printable char)
//     → pre-tokenizer regex split
//     → per-piece greedy BPE merge (rank-lowest pair each round)
//     → vocab lookup → token IDs
//
//   decode: ids → pieces → concat → inverse unicode map → UTF-8 bytes → text
//
// Special tokens (<|im_start|>, <|im_end|>, <|endoftext|>) live in the
// `added_tokens` array of tokenizer.json and are matched verbatim before BPE.

import { readFileSync } from 'node:fs';

interface AddedToken {
  id: number;
  content: string;
  special?: boolean;
}

interface TokenizerJson {
  model: {
    type: string;
    vocab: Record<string, number>;
    merges: string[] | Array<[string, string]>;
  };
  added_tokens?: AddedToken[];
}

// GPT-2 / Qwen 2.5 byte↔unicode map — same 256-entry bijection used by tiktoken
// cl100k, HuggingFace GPT-2, and Qwen 2.5. Bytes that render as printable ASCII
// keep their identity; the rest are mapped into a private range so every byte
// becomes a single visible Unicode codepoint safe for BPE.
function bytesToUnicode(): Map<number, string> {
  const bs: number[] = [];
  for (let i = 33; i <= 126; i++) bs.push(i); // '!'..'~'
  for (let i = 161; i <= 172; i++) bs.push(i);
  for (let i = 174; i <= 255; i++) bs.push(i);
  const cs = bs.slice();
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }
  const map = new Map<number, string>();
  for (let i = 0; i < bs.length; i++) {
    map.set(bs[i], String.fromCodePoint(cs[i]));
  }
  return map;
}

// GPT-2 pre-tokenizer regex — splits contractions, letters, digits, and
// whitespace runs. Qwen 2.5 uses this same pattern.
// Note: the trailing " ?" is intentional; leading spaces stay glued to words.
const PRETOK_RE =
  /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

export class QwenTokenizer {
  private readonly vocab = new Map<string, number>();
  private readonly decoder = new Map<number, string>();
  private readonly bpeRanks = new Map<string, number>();
  private readonly byteEncoder: Map<number, string>;
  private readonly byteDecoder = new Map<string, number>();
  private readonly specialTokens = new Map<string, number>();
  private readonly specialRegex: RegExp | null;

  constructor(tokenizerJsonPath: string) {
    const config: TokenizerJson = JSON.parse(
      readFileSync(tokenizerJsonPath, 'utf8')
    );
    if (config.model.type !== 'BPE') {
      throw new Error(`expected BPE tokenizer, got type=${config.model.type}`);
    }

    for (const [tok, id] of Object.entries(config.model.vocab)) {
      this.vocab.set(tok, id);
      this.decoder.set(id, tok);
    }

    // Merges may arrive as "a b" strings or [a, b] tuples depending on
    // tokenizer.json version. Normalize to space-joined for lookup.
    const rawMerges = config.model.merges;
    for (let i = 0; i < rawMerges.length; i++) {
      const m = rawMerges[i];
      const key = Array.isArray(m) ? `${m[0]} ${m[1]}` : m;
      this.bpeRanks.set(key, i);
    }

    this.byteEncoder = bytesToUnicode();
    for (const [byte, ch] of this.byteEncoder) {
      this.byteDecoder.set(ch, byte);
    }

    if (config.added_tokens) {
      for (const t of config.added_tokens) {
        this.specialTokens.set(t.content, t.id);
        this.decoder.set(t.id, t.content);
      }
    }

    // Sort special tokens longest-first so overlapping patterns match greedily
    const specials = [...this.specialTokens.keys()].sort(
      (a, b) => b.length - a.length
    );
    if (specials.length > 0) {
      const escaped = specials.map((s) =>
        s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      );
      this.specialRegex = new RegExp(`(${escaped.join('|')})`);
    } else {
      this.specialRegex = null;
    }
  }

  private getPairs(word: string[]): Set<string> {
    const pairs = new Set<string>();
    for (let i = 0; i < word.length - 1; i++) {
      pairs.add(`${word[i]} ${word[i + 1]}`);
    }
    return pairs;
  }

  private bpe(token: string): string[] {
    if (this.vocab.has(token)) return [token];

    let word = Array.from(token);
    let pairs = this.getPairs(word);
    if (pairs.size === 0) return word;

    while (true) {
      let bestPair: string | null = null;
      let bestRank = Infinity;
      for (const p of pairs) {
        const rank = this.bpeRanks.get(p);
        if (rank !== undefined && rank < bestRank) {
          bestRank = rank;
          bestPair = p;
        }
      }
      if (bestPair === null) break;

      const [first, second] = bestPair.split(' ');
      const newWord: string[] = [];
      let i = 0;
      while (i < word.length) {
        const j = word.indexOf(first, i);
        if (j === -1) {
          newWord.push(...word.slice(i));
          break;
        }
        newWord.push(...word.slice(i, j));
        if (j < word.length - 1 && word[j + 1] === second) {
          newWord.push(first + second);
          i = j + 2;
        } else {
          newWord.push(word[j]);
          i = j + 1;
        }
      }
      word = newWord;
      if (word.length === 1) break;
      pairs = this.getPairs(word);
    }
    return word;
  }

  private encodePiece(text: string): number[] {
    const bytes = new TextEncoder().encode(text);
    let mapped = '';
    for (const b of bytes) mapped += this.byteEncoder.get(b) ?? '';

    const ids: number[] = [];
    const pretokens = mapped.match(PRETOK_RE) ?? [mapped];
    for (const pt of pretokens) {
      const bpeTokens = this.bpe(pt);
      for (const t of bpeTokens) {
        const id = this.vocab.get(t);
        if (id === undefined) {
          throw new Error(`BPE produced OOV token: ${JSON.stringify(t)}`);
        }
        ids.push(id);
      }
    }
    return ids;
  }

  encode(text: string): number[] {
    if (!text) return [];

    // Split on special tokens first so they never get chopped by BPE
    if (!this.specialRegex) return this.encodePiece(text);

    const ids: number[] = [];
    const parts = text.split(this.specialRegex);
    for (const part of parts) {
      if (part === '') continue;
      const specialId = this.specialTokens.get(part);
      if (specialId !== undefined) {
        ids.push(specialId);
      } else {
        ids.push(...this.encodePiece(part));
      }
    }
    return ids;
  }

  decode(ids: number[]): string {
    let mapped = '';
    for (const id of ids) {
      const piece = this.decoder.get(id);
      if (piece === undefined) continue;
      // Special tokens print verbatim; BPE pieces need byte-inverse
      if (this.specialTokens.has(piece)) {
        mapped += piece;
      } else {
        mapped += piece;
      }
    }

    // Inverse byte map — split into codepoints, look each up
    const bytes: number[] = [];
    for (const ch of mapped) {
      const b = this.byteDecoder.get(ch);
      if (b !== undefined) {
        bytes.push(b);
      } else {
        // Special-token characters or codepoints outside the BPE alphabet:
        // encode them back to UTF-8 bytes so the output still round-trips.
        const utf8 = new TextEncoder().encode(ch);
        for (const u of utf8) bytes.push(u);
      }
    }
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  }

  get vocabSize(): number {
    return this.vocab.size + this.specialTokens.size;
  }
}
