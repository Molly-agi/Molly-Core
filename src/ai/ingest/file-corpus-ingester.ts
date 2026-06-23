/**
 * @fileOverview file-corpus-ingester — Item 18 left-hemisphere ingest seam.
 *
 * Reads a local file, chunks it into character windows, and writes each
 * chunk through `KnowledgeStore.writeFact()` under a per-dump corpus
 * userId (prefixed `corpus:` — the visual flag for the data-as-user
 * pattern, see brain-roadmap item 18 / PR discussion on PR #267 follow-up).
 *
 * Scope:
 *   - file → corpus knowledge entries, that's it
 *   - no PDF/Word/etc conversion (that's item 19, MarkItDown)
 *   - no network ingest (HTTP/dump fetching is a future PR; this seam takes
 *     whatever the caller already has on disk)
 *   - no embedding at write — writeFact() leaves embeddings null; recall
 *     fills them lazily via the existing item 12 path
 *
 * The fan-out side of the seam lives in `neural-engram.ts`
 * (`recallEverything({ corpora })`); ops wiring lives in
 * `base-composer.ts` (`MOLLY_CORPUS_NAMESPACES` env). Contract locked by
 * `corpus-ingest-recall-fanout.contract.test.ts`.
 */

import { promises as fs } from 'fs';
import { getKnowledgeStore } from '@/ai/memory/knowledge-store';
import { MollyLogger } from '@/ai/logger';

export interface IngestFileCorpusOptions {
  /**
   * Corpus identifier without the `corpus:` prefix. Required. Used to build
   * the per-dump userId `corpus:${namespace}` so two dumps never collide
   * and per-dump introspection / decay stays viable (see item 18 plan).
   */
  namespace: string;
  /**
   * Character window per chunk. Defaults to 2000 — a conservative middle
   * ground for the lazy-embed pathway (BGE-small handles ~512 tokens
   * ≈ ~2k chars before truncation; larger windows degrade cosine quality).
   */
  chunkChars?: number;
  /**
   * Tags attached to every chunk. Defaults to []. The namespace is NOT
   * auto-tagged because the entry's userId already encodes it.
   */
  tags?: string[];
  /**
   * Importance for every chunk. Defaults to 0.5 (matches the `'import'`
   * write-path default in engram-provenance).
   */
  importance?: number;
}

export interface IngestFileCorpusResult {
  /** Resolved userId, including the `corpus:` prefix. */
  namespace: string;
  /** Number of chunks written. */
  chunks: number;
  /** Total byte length of the source file (utf-8). */
  bytes: number;
}

const DEFAULT_CHUNK_CHARS = 2000;

function chunkText(text: string, chunkChars: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkChars) {
    const slice = text.slice(i, i + chunkChars).trim();
    if (slice.length > 0) chunks.push(slice);
  }
  return chunks;
}

export async function ingestFileCorpus(
  filePath: string,
  options: IngestFileCorpusOptions
): Promise<IngestFileCorpusResult> {
  if (!options.namespace || !options.namespace.trim()) {
    throw new Error('ingestFileCorpus: options.namespace is required');
  }
  const userId = `corpus:${options.namespace.trim()}`;
  const chunkChars = options.chunkChars ?? DEFAULT_CHUNK_CHARS;
  const tags = options.tags ?? [];
  const importance = options.importance ?? 0.5;

  const content = await fs.readFile(filePath, 'utf8');
  const bytes = Buffer.byteLength(content, 'utf8');
  const pieces = chunkText(content, chunkChars);

  const store = await getKnowledgeStore(userId);
  let written = 0;
  for (let i = 0; i < pieces.length; i++) {
    try {
      await store.writeFact(pieces[i], {
        id: `kf-${options.namespace.trim()}-${i.toString().padStart(6, '0')}`,
        tags,
        importance,
      });
      written++;
    } catch (err) {
      MollyLogger.warn(
        'ingestFileCorpus: writeFact failed for chunk; continuing',
        'file-corpus-ingester',
        { namespace: userId, chunkIndex: i, filePath },
        err
      );
    }
  }

  MollyLogger.info('ingestFileCorpus: complete', 'file-corpus-ingester', {
    namespace: userId,
    chunks: written,
    bytes,
    filePath,
  });

  return { namespace: userId, chunks: written, bytes };
}
