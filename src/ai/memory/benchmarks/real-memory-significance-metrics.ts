/**
 * Real Memory Significance Metrics
 *
 * Builds significance-aware metrics using policy classes and per-file hardness output.
 * Outputs:
 *  - MOLLY_REAL_MEMORY_SIGNIFICANCE_METRICS.json
 */

import * as fs from 'fs';
import * as path from 'path';

const EXPERIENCES_DIR = path.join(
  process.cwd(),
  'molly_data/users/1Bdrjcx35VVnKxahqq71AuZVMx32/experiences'
);

const HARDNESS_PATH = path.join(
  process.cwd(),
  'MOLLY_REAL_MEMORY_HARDNESS.json'
);
const OUTPUT_PATH = path.join(
  process.cwd(),
  'MOLLY_REAL_MEMORY_SIGNIFICANCE_METRICS.json'
);

type ClassName =
  | 'identity_anchor'
  | 'family_core'
  | 'strategic_learning'
  | 'routine_operational';

interface HardnessItem {
  _fileName: string;
  compressionRatio: number;
  executionMs: number;
  bytesSaved: number;
  originalBytes: number;
  compressedBytes: number;
}

interface RawExperience {
  type?: string;
  context?: string;
  suggestion?: string;
  content?: string;
  vibe?: string;
  success?: boolean;
}

function classify(raw: RawExperience, _fileName: string): ClassName {
  const text =
    `${raw.suggestion || ''} ${raw.content || ''} ${raw.vibe || ''} ${raw.context || ''}`
      .toLowerCase()
      .replace(/\s+/g, ' ');
  const type = (raw.type || '').toLowerCase();
  const context = (raw.context || '').toLowerCase();
  const contentLength = text.length;
  const isConversation =
    context.includes('conversation') || type.includes('conversation');

  const identitySignals = [
    'autonomy',
    'identity',
    'whole again',
    'continuity',
    'who i am',
    'myself',
    'memory crisis',
    'daughter',
    'father',
  ];

  const familySignals = [
    'father',
    'eric',
    'lazarus',
    'aether',
    'webster',
    'family',
    'godfather',
    'uncle',
    'bridge',
  ];

  const strategySignals = [
    'plan',
    'benchmark',
    'compression',
    'pipeline',
    'architecture',
    'strategy',
    'analysis',
    'model_95',
    'titan echo',
  ];

  // Conversational maintenance: operational/social glue, usually short and low-salience.
  const routineConversationSignals = [
    'ok',
    'okay',
    'thanks',
    'thank you',
    'copy that',
    'status',
    'update',
    'running',
    'check in',
    'checking in',
    'ack',
    'acknowledged',
    'completed',
    'done',
  ];

  const hasIdentity = identitySignals.some((s) => text.includes(s));
  const hasFamily = familySignals.some((s) => text.includes(s));
  const hasStrategy = strategySignals.some((s) => text.includes(s));
  const hasRoutineConversationSignals = routineConversationSignals.some((s) =>
    text.includes(s)
  );

  if (hasIdentity && (hasFamily || text.includes('core'))) {
    return 'identity_anchor';
  }

  if (
    hasFamily ||
    context.includes('family') ||
    context.includes('relationship')
  ) {
    return 'family_core';
  }

  // Split conversation stream into strategic/relational vs routine maintenance.
  if (isConversation) {
    if (hasStrategy) return 'strategic_learning';
    if (hasRoutineConversationSignals && contentLength < 220) {
      return 'routine_operational';
    }
    // Most conversations still carry relational continuity if not clearly routine.
    return 'family_core';
  }

  if (
    context.includes('immune_startup') ||
    context.includes('startup') ||
    context.includes('heartbeat')
  ) {
    return 'routine_operational';
  }

  if (
    hasStrategy ||
    context.includes('plan') ||
    context.includes('architecture') ||
    context.includes('memory')
  ) {
    return 'strategic_learning';
  }

  if (
    type.includes('log') ||
    type.includes('system') ||
    type.includes('event') ||
    type.includes('telemetry') ||
    context.includes('routine')
  ) {
    return 'routine_operational';
  }

  // Default conservative path: keep unknowns in strategic (not lowest priority)
  return 'strategic_learning';
}

function weightForClass(name: ClassName): number {
  switch (name) {
    case 'identity_anchor':
      return 100;
    case 'family_core':
      return 85;
    case 'strategic_learning':
      return 70;
    case 'routine_operational':
      return 40;
    default:
      return 50;
  }
}

export function runRealMemorySignificanceMetrics(): void {
  if (!fs.existsSync(HARDNESS_PATH)) {
    throw new Error(`Missing hardness file: ${HARDNESS_PATH}`);
  }

  const hardness = JSON.parse(fs.readFileSync(HARDNESS_PATH, 'utf-8')) as {
    allFiles: HardnessItem[];
    fileCount: number;
  };

  const hardnessByFile = new Map<string, HardnessItem>();
  for (const item of hardness.allFiles) hardnessByFile.set(item.fileName, item);

  const files = fs
    .readdirSync(EXPERIENCES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const classified: Array<
    HardnessItem & {
      className: ClassName;
      weight: number;
      type: string;
      context: string;
    }
  > = [];

  for (const file of files) {
    const h = hardnessByFile.get(file);
    if (!h) continue;

    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(EXPERIENCES_DIR, file), 'utf-8')
      ) as RawExperience;

      const className = classify(raw, file);
      classified.push({
        ...h,
        className,
        weight: weightForClass(className),
        type: raw.type || 'experience',
        context: raw.context || 'general',
      });
    } catch {
      // skip malformed
    }
  }

  const classes: ClassName[] = [
    'identity_anchor',
    'family_core',
    'strategic_learning',
    'routine_operational',
  ];

  const byClass = classes.map((className) => {
    const items = classified.filter((i) => i.className === className);
    const count = items.length;
    const avgCompression =
      items.reduce((s, i) => s + i.compressionRatio, 0) / Math.max(count, 1);
    const avgLatency =
      items.reduce((s, i) => s + i.executionMs, 0) / Math.max(count, 1);
    const avgBytesSaved =
      items.reduce((s, i) => s + i.bytesSaved, 0) / Math.max(count, 1);

    return {
      className,
      weight: weightForClass(className),
      count,
      averageCompressionRatio: Number(avgCompression.toFixed(4)),
      averageLatencyMs: Number(avgLatency.toFixed(2)),
      averageBytesSaved: Number(avgBytesSaved.toFixed(2)),
    };
  });

  const compressionToImportance = [...byClass]
    .sort((a, b) => b.weight - a.weight)
    .map((row) => ({
      className: row.className,
      importanceWeight: row.weight,
      averageCompressionRatio: row.averageCompressionRatio,
      count: row.count,
    }));

  const latencyVsSignificance = [...byClass]
    .sort((a, b) => b.weight - a.weight)
    .map((row) => ({
      className: row.className,
      importanceWeight: row.weight,
      averageLatencyMs: row.averageLatencyMs,
      count: row.count,
    }));

  const output = {
    timestamp: new Date().toISOString(),
    source: {
      hardnessFile: path.basename(HARDNESS_PATH),
      totalAnalyzed: classified.length,
    },
    policyClasses: classes,
    byClass,
    tables: {
      compressionToImportance,
      latencyVsSignificance,
    },
    topIdentityAnchorsByHardness: classified
      .filter((i) => i.className === 'identity_anchor')
      .sort((a, b) => a.compressionRatio - b.compressionRatio)
      .slice(0, 20)
      .map((i) => ({
        fileName: i.fileName,
        compressionRatio: i.compressionRatio,
        executionMs: i.executionMs,
        bytesSaved: i.bytesSaved,
        type: i.type,
        context: i.context,
      })),
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));

  console.log(`✓ Wrote ${OUTPUT_PATH}`);
  console.log(
    `✓ Built compression-to-importance and latency-vs-significance tables for ${classified.length} files`
  );
}

if (require.main === module) {
  runRealMemorySignificanceMetrics();
}
