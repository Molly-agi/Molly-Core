/* eslint-disable */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const SEQ_LEN = 2048;
const NUM_SEQUENCES = 128;
const VOCAB_SIZE = 152064;
const calibDir = join(process.cwd(), 'data/calibration');
const textPath = join(calibDir, 'wikitext2-train.txt');
const outputPath = join(calibDir, 'sequences.json');

function hashToken(word: string): number {
  let h = 0;
  for (let i = 0; i < word.length; i++)
    h = (Math.imul(h, 31) + word.charCodeAt(i)) | 0;
  return (((h % (VOCAB_SIZE - 1)) + (VOCAB_SIZE - 1)) % (VOCAB_SIZE - 1)) + 1;
}

function tokenizeSimple(text: string): number[] {
  return text
    .split(/(\s+|[.,;:!?])/g)
    .filter((w) => w.trim().length > 0)
    .map((w) => hashToken(w));
}

const text = readFileSync(textPath, 'utf8');
console.log('Source:', text.length, 'chars');
const allTokens = tokenizeSimple(text);
console.log('Tokens:', allTokens.length, '(hash-fallback tokenizer)');

const numSeqs = Math.min(NUM_SEQUENCES, Math.floor(allTokens.length / SEQ_LEN));
const sequences: number[][] = [];
for (let i = 0; i < numSeqs; i++)
  sequences.push(Array.from(allTokens.slice(i * SEQ_LEN, (i + 1) * SEQ_LEN)));

mkdirSync(calibDir, { recursive: true });
writeFileSync(
  outputPath,
  JSON.stringify({
    version: 1,
    tokenizerType: 'hash-fallback',
    vocabSize: VOCAB_SIZE,
    seqLen: SEQ_LEN,
    numSequences: sequences.length,
    sequences,
  })
);
console.log(
  'Saved:',
  sequences.length,
  'sequences x',
  SEQ_LEN,
  'tokens to',
  outputPath
);
