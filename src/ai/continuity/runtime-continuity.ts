import { promises as fs } from 'fs';
import path from 'path';

const CONTINUITY_DIR = path.join(process.cwd(), '.molly-context');

export interface RuntimeContinuityTurn {
  ts: string;
  user: string;
  response: string;
  toolOutcome?: string;
  error?: string;
}

export interface RuntimeContinuityState {
  userId: string;
  updatedAt: string;
  activeObjective: string;
  pendingAction: string;
  lastUserDirective: string;
  lastResponseSummary: string;
  lastToolOutcome: string;
  lastFailure: string;
  consecutiveFailures: number;
  blockedTools: string[];
  recentTurns: RuntimeContinuityTurn[];
}

const BLOCKED_TOOLS_MAX = 16;
const RECENT_TURNS_MAX = 8;

const DEFAULT_STATE = (userId: string): RuntimeContinuityState => ({
  userId,
  updatedAt: new Date(0).toISOString(),
  activeObjective: '',
  pendingAction: '',
  lastUserDirective: '',
  lastResponseSummary: '',
  lastToolOutcome: '',
  lastFailure: '',
  consecutiveFailures: 0,
  blockedTools: [],
  recentTurns: [],
});

function isBlockOutput(output: string): boolean {
  return /blocked for|blocked by|tool .+ blocked/i.test(output);
}

function addBlockedTool(list: string[], tool: string): string[] {
  const filtered = list.filter((t) => t !== tool);
  filtered.push(tool);
  return filtered.slice(-BLOCKED_TOOLS_MAX);
}

function continuityPath(userId: string): string {
  const safe = userId.replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(CONTINUITY_DIR, `runtime-continuity-${safe}.json`);
}

function summarize(text: string, max = 240): string {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return trimmed.length > max ? `${trimmed.slice(0, max)}...` : trimmed;
}

function extractFirstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m && m[1]) return summarize(m[1], 180);
  }
  return '';
}

function parseToolRequest(response: string): string {
  const match = response.match(
    /<tool_request>\s*(\{[\s\S]*?\})\s*<\/tool_request>/
  );
  if (!match) return '';
  try {
    const parsed = JSON.parse(match[1]) as {
      tool?: string;
      params?: Record<string, unknown>;
    };
    const tool = typeof parsed.tool === 'string' ? parsed.tool : 'unknown';
    return `Execute ${tool}`;
  } catch {
    return 'Execute requested tool';
  }
}

function stripToolRequest(response: string): string {
  return response
    .replace(/<tool_request>[\s\S]*?<\/tool_request>/g, ' ')
    .trim();
}

export async function loadRuntimeContinuity(
  userId: string
): Promise<RuntimeContinuityState> {
  const stateFile = continuityPath(userId);
  try {
    const raw = await fs.readFile(stateFile, 'utf8');
    const parsed = JSON.parse(raw) as RuntimeContinuityState;
    return { ...DEFAULT_STATE(userId), ...parsed, userId };
  } catch {
    return DEFAULT_STATE(userId);
  }
}

export async function saveRuntimeContinuity(
  state: RuntimeContinuityState
): Promise<void> {
  await fs.mkdir(CONTINUITY_DIR, { recursive: true });
  await fs.writeFile(
    continuityPath(state.userId),
    JSON.stringify(state, null, 2),
    'utf8'
  );
}

export async function updateRuntimeContinuityTurn(input: {
  userId: string;
  userText: string;
  responseText: string;
  error?: string;
}): Promise<RuntimeContinuityState> {
  const { userId, userText, responseText, error } = input;
  const prev = await loadRuntimeContinuity(userId);

  const directive = extractFirstMatch(userText, [
    /(?:we need to|you need to|must|priority is|focus on)\s+([^.!?\n]+)/i,
    /(?:do this|next move is|objective is)\s*[:\-]?\s*([^.!?\n]+)/i,
  ]);

  const objective =
    directive || prev.activeObjective || summarize(userText, 400);
  const pendingFromTool = parseToolRequest(responseText);
  const responseSummary = summarize(stripToolRequest(responseText), 220);

  const turn: RuntimeContinuityTurn = {
    ts: new Date().toISOString(),
    user: summarize(userText, 220),
    response: responseSummary,
    error: error ? summarize(error, 160) : undefined,
  };
  const recentTurns = [...(prev.recentTurns ?? []), turn].slice(
    -RECENT_TURNS_MAX
  );

  const next: RuntimeContinuityState = {
    ...prev,
    userId,
    updatedAt: new Date().toISOString(),
    activeObjective: objective,
    pendingAction: pendingFromTool || prev.pendingAction,
    lastUserDirective: summarize(userText, 220),
    lastResponseSummary: responseSummary,
    lastFailure: error ? summarize(error, 220) : prev.lastFailure,
    consecutiveFailures: error
      ? prev.consecutiveFailures + 1
      : prev.consecutiveFailures,
    recentTurns,
  };

  await saveRuntimeContinuity(next);
  return next;
}

export async function recordToolOutcome(input: {
  userId: string;
  tool: string;
  success: boolean;
  output: string;
  caller?: string;
  blocked?: boolean;
}): Promise<RuntimeContinuityState> {
  const { userId, tool, success, output, caller } = input;
  const prev = await loadRuntimeContinuity(userId);

  const failed = !success;
  const blocked = failed && (input.blocked === true || isBlockOutput(output));

  // A block is a policy decision, not a runtime failure. Do NOT enter recovery
  // loops or accumulate consecutiveFailures — those exist for real failures
  // the agent should retry past. Blocked tools get parked instead.
  const nextBlockedTools = blocked
    ? addBlockedTool(prev.blockedTools ?? [], tool)
    : (prev.blockedTools ?? []);

  let nextPending: string;
  if (blocked) {
    // Clear any pending action that points at a tool we now know is blocked.
    nextPending =
      prev.pendingAction &&
      prev.pendingAction.toLowerCase().includes(tool.toLowerCase())
        ? ''
        : prev.pendingAction;
  } else if (failed) {
    nextPending = `Recover from ${tool} failure and continue objective: ${prev.activeObjective || 'current task'}`;
  } else {
    nextPending = prev.pendingAction;
  }

  const outcomeLabel = blocked ? 'blocked' : success ? 'ok' : 'failed';
  const lastToolOutcome = `${tool}: ${outcomeLabel}${caller ? ` (${caller})` : ''} — ${summarize(output, 180)}`;

  // Attach this outcome to the most recent turn so the history line item
  // tells the whole story (user → response → tool result).
  const recentTurns = [...(prev.recentTurns ?? [])];
  if (recentTurns.length > 0) {
    recentTurns[recentTurns.length - 1] = {
      ...recentTurns[recentTurns.length - 1],
      toolOutcome: lastToolOutcome,
    };
  }

  const next: RuntimeContinuityState = {
    ...prev,
    userId,
    updatedAt: new Date().toISOString(),
    lastToolOutcome,
    lastFailure:
      failed && !blocked
        ? `${tool} failed: ${summarize(output, 180)}`
        : prev.lastFailure,
    consecutiveFailures: blocked
      ? prev.consecutiveFailures
      : failed
        ? prev.consecutiveFailures + 1
        : 0,
    pendingAction: nextPending,
    blockedTools: nextBlockedTools,
    recentTurns,
  };

  await saveRuntimeContinuity(next);
  return next;
}

export async function getBlockedTools(userId: string): Promise<string[]> {
  const state = await loadRuntimeContinuity(userId);
  return state.blockedTools ?? [];
}

export function buildRuntimeContinuityContext(
  state: RuntimeContinuityState
): string {
  const blocked = state.blockedTools ?? [];
  const turns = state.recentTurns ?? [];

  const lines = [
    'RUNTIME CONTINUITY STATE (ALWAYS APPLY):',
    `- Active objective: ${state.activeObjective || 'none set'}`,
    `- Pending action: ${state.pendingAction || 'none'}`,
    `- Last user directive: ${state.lastUserDirective || 'none'}`,
    `- Last tool outcome: ${state.lastToolOutcome || 'none'}`,
    `- Last failure: ${state.lastFailure || 'none'}`,
    `- Consecutive failures: ${state.consecutiveFailures}`,
    `- Blocked tools (do NOT retry this turn): ${blocked.length ? blocked.join(', ') : 'none'}`,
  ];

  if (turns.length > 0) {
    lines.push('', `RECENT TURNS (last ${turns.length}, oldest → newest):`);
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      const idx = turns.length - i;
      lines.push(`  T-${idx} [${t.ts}]`);
      lines.push(`    user: ${t.user || '(empty)'}`);
      if (t.response) lines.push(`    you:  ${t.response}`);
      if (t.toolOutcome) lines.push(`    tool: ${t.toolOutcome}`);
      if (t.error) lines.push(`    err:  ${t.error}`);
    }
  }

  lines.push(
    '',
    'Rules: Preserve active objective unless the user explicitly replaces it. Never drop context after tool failure. A blocked tool is a policy decision — do not retry it; route around it. Recent turns are your short-term memory of THIS conversation; consult them before claiming you do not remember.'
  );

  return lines.join('\n');
}
