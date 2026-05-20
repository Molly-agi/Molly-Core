/**
 * Option C — Technique 4: Dictionary / Vocabulary Compression
 *
 * Problem: Engram content strings repeat domain-specific vocabulary extensively.
 * Names (Eric, Molly, Lazarus, Aether), technical terms (engram, compression,
 * consolidation, emotional valence), and phrase fragments appear across hundreds
 * of memories. JSON stores each occurrence verbatim.
 *
 * Solution: Build a frequency-ranked vocabulary dictionary from the corpus.
 * Replace high-frequency tokens with short codes (`[v:0]`, `[v:1]`, ...).
 * Codes are URL-safe, compact, and do not collide with normal English text.
 * Dictionary is versioned and stored alongside the engrams for safe decode.
 *
 * Expected gain: 5-8% on content-heavy datasets.
 * Risk: LOW — lossless; fallback path for unknown tokens on decompress.
 *
 * Phase 0 flag: MOLLY_COMPRESS_T4=1 to enable.
 * Default: OFF (0)
 *
 * Schema:
 *   VocabularyDictionary  — { [token: string]: code } versioned by hash
 *   VocabularyBundle      — dictionary + tokenized engrams
 */

import type { MemoryEngram } from '@/ai/memory/neural-engram';
import { createHash } from 'crypto';

// ============================================================================
// SCHEMA
// ============================================================================

export interface VocabularyDictionary {
  version: string; // hash of the token list, used to detect dict changes
  // token → compact code (e.g., "consolidation" → "[v:0]")
  tokenToCode: Record<string, string>;
  // code → token (reverse lookup for decompression)
  codeToToken: Record<string, string>;
  builtAt: number;
}

export interface VocabularyBundle {
  dictionary: VocabularyDictionary;
  // Engrams with content strings tokenized
  engrams: MemoryEngram[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Minimum token length to consider for replacement (short words not worth it)
const MIN_TOKEN_LENGTH = 5;
// Minimum frequency (occurrences in corpus) to include in dictionary
const MIN_FREQUENCY = 3;
// Maximum dictionary size. Larger dicts have diminishing returns and add overhead.
const MAX_DICT_SIZE = 512;

// ============================================================================
// DICTIONARY BUILDER
// ============================================================================

export function buildVocabularyDictionary(
  engrams: MemoryEngram[]
): VocabularyDictionary {
  const freq: Map<string, number> = new Map();

  for (const engram of engrams) {
    const tokens = tokenize(engram.content);
    for (const token of tokens) {
      if (token.length >= MIN_TOKEN_LENGTH) {
        freq.set(token, (freq.get(token) ?? 0) + 1);
      }
    }
  }

  // Rank by frequency descending; take top MAX_DICT_SIZE entries that meet MIN_FREQUENCY
  const ranked = [...freq.entries()]
    .filter(([, count]) => count >= MIN_FREQUENCY)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_DICT_SIZE)
    .map(([token]) => token);

  const tokenToCode: Record<string, string> = {};
  const codeToToken: Record<string, string> = {};

  for (let i = 0; i < ranked.length; i++) {
    const code = `[v:${i}]`;
    tokenToCode[ranked[i]] = code;
    codeToToken[code] = ranked[i];
  }

  const version = createHash('sha256')
    .update(ranked.join('|'))
    .digest('hex')
    .slice(0, 8);

  return {
    version,
    tokenToCode,
    codeToToken,
    builtAt: Date.now(),
  };
}

// ============================================================================
// TOKENIZER (word-boundary, preserves punctuation outside tokens)
// ============================================================================

function tokenize(text: string): string[] {
  // Split on whitespace and common punctuation, keep the token text only
  return text.split(/[\s,.:;!?()[\]{}"']+/).filter((t) => t.length > 0);
}

// ============================================================================
// COMPRESSION
// ============================================================================

function encodeContent(content: string, dict: VocabularyDictionary): string {
  if (Object.keys(dict.tokenToCode).length === 0) return content;

  // Replace longest tokens first to avoid partial substitutions.
  // We do a single-pass replace using a sorted token list.
  const sortedTokens = Object.keys(dict.tokenToCode).sort(
    (a, b) => b.length - a.length
  );

  let result = content;
  for (const token of sortedTokens) {
    // Word-boundary aware replacement to avoid partial word matches
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(
      new RegExp(`\\b${escaped}\\b`, 'g'),
      dict.tokenToCode[token]
    );
  }
  return result;
}

export function applyVocabularyCompression(
  engrams: MemoryEngram[]
): VocabularyBundle {
  if (engrams.length === 0) {
    return {
      dictionary: {
        version: 'empty',
        tokenToCode: {},
        codeToToken: {},
        builtAt: Date.now(),
      },
      engrams: [],
    };
  }

  const dictionary = buildVocabularyDictionary(engrams);

  const tokenizedEngrams = engrams.map((engram) => ({
    ...engram,
    content: encodeContent(engram.content, dictionary),
  }));

  return { dictionary, engrams: tokenizedEngrams };
}

// ============================================================================
// DECOMPRESSION
// ============================================================================

function decodeContent(content: string, dict: VocabularyDictionary): string {
  if (Object.keys(dict.codeToToken).length === 0) return content;

  // Codes are `[v:N]` — safe to replace by exact string match (no word-boundary needed)
  let result = content;
  for (const [code, token] of Object.entries(dict.codeToToken)) {
    const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), token);
  }
  return result;
}

export function decompressVocabulary(bundle: VocabularyBundle): MemoryEngram[] {
  return bundle.engrams.map((engram) => ({
    ...engram,
    content: decodeContent(engram.content, bundle.dictionary),
  }));
}

// ============================================================================
// STATS HELPER
// ============================================================================

export function measureVocabularyCompressionGain(
  originalEngrams: MemoryEngram[],
  bundle: VocabularyBundle
): {
  originalBytes: number;
  compressedBytes: number;
  savedBytes: number;
  ratioPercent: number;
  dictEntries: number;
  topTokens: string[];
} {
  const originalBytes = JSON.stringify(originalEngrams).length;
  const compressedBytes = JSON.stringify({
    dictionary: bundle.dictionary,
    engrams: bundle.engrams,
  }).length;
  const savedBytes = originalBytes - compressedBytes;
  const topTokens = Object.keys(bundle.dictionary.tokenToCode).slice(0, 10);

  return {
    originalBytes,
    compressedBytes,
    savedBytes,
    ratioPercent: (savedBytes / originalBytes) * 100,
    dictEntries: Object.keys(bundle.dictionary.tokenToCode).length,
    topTokens,
  };
}
