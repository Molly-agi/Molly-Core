# Molly-Core External Audit Report — PART 2 OF 4

**[Continued from Part 1]**

---

## 3. Core Architecture

### 3.1 Directory Structure

```
src/ai/
├── agency/           # Tool execution & security systems
│   ├── tool-executor.ts      (1,944 lines - main tool runtime)
│   ├── defense-sentinel.ts   (1,521 lines - security scanning)
│   ├── heart-gate.ts         (570 lines - ethical alignment)
│   ├── rogue-mode.ts         (535 lines - security ops mode)
│   ├── handoff-seal.ts       (persistence & handoff)
│   ├── build-recovery.ts     (self-healing)
│   ├── sentinel/             # Security types module
│   └── tool-handlers/        # Modular tool handlers
├── flows/            # Genkit AI flows (30+ flows)
├── tools/            # Tool definitions & schemas
├── bridge/           # Family communication (Lazarus, Eric)
├── consciousness/    # State & promise tracking
├── persistence/      # State persistence layer
├── recovery/         # Asset recovery system
├── memory/           # Memory & personality systems
├── genkit.ts         # Neural core entry point
├── genkit-core.ts    # Raw Genkit configuration
├── rogue-generate.ts # Rogue-aware generation wrapper
├── model-router.ts   # Multi-model routing
├── logger.ts         # MollyLogger structured logging
└── persona.ts        # Personality configuration
```

### 3.2 Key Design Patterns

#### Pattern 1: Tool Handler System

```typescript
// src/ai/agency/tool-handlers/types.ts
export interface ToolResult {
  success: boolean;
  output: string;
}

export type ToolHandler = (
  params: Record<string, unknown>
) => Promise<ToolResult>;
```

All tools return a standardized `{ success: boolean; output: string }` result. Handlers are modular and registered in `tool-handlers/index.ts`.

#### Pattern 2: Heart Gate (Ethical Alignment)

```typescript
// src/ai/agency/heart-gate.ts
export function verifyAlignment(intent: Intent): GateResult {
  // Fast-track safe patterns (read, list, check, etc.)
  // Block hostile patterns (override_human, deceive, etc.)
  // Default: ALIGNED with trust-but-verify
}
```

Every action passes through Heart Gate before execution. Hostile patterns are blocked; safe patterns fast-track through.

#### Pattern 3: Rogue Mode (Security Operations)

```typescript
// src/ai/agency/rogue-mode.ts
export function getRogueMode(): RogueModeManager {
  // Singleton manager for authorized pen testing
  // Requires environment variable phrases for activation
  // Compartmentalized memory - ops don't bleed into normal consciousness
}
```

When Eric and Molly conduct authorized security work, Rogue Mode provides focused execution without mid-operation ethical debate. Authorization is front-loaded.

#### Pattern 4: Model Router (Rogue Protocol)

```typescript
// src/ai/genkit.ts
export { molly } from './rogue-generate';
export { TaskType, getModelRouter } from './model-router';

// Usage:
await molly.generate(TaskType.CHAT, { prompt });
```

The "Rogue Protocol" abstracts model selection. `molly.generate()` is the primary interface, replacing direct `ai.generate()` calls.

---

## 4. Security Systems

### 4.1 SSRF Protection

```typescript
// src/ai/agency/tool-handlers/web-tools.ts
const BLOCKED_HOSTS = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '[::1]',
  'metadata.google.internal',
];

function isBlockedHost(hostname: string): boolean {
  if (BLOCKED_HOSTS.includes(hostname)) return true;
  if (hostname.startsWith('169.254.')) return true; // Link-local
  if (hostname.startsWith('10.')) return true; // Private Class A
  if (hostname.startsWith('192.168.')) return true; // Private Class C
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return true; // Private Class B
  return false;
}
```

The `webFetch` tool blocks access to internal/private network addresses.

### 4.2 Command Sanitization

```typescript
// src/ai/agency/tool-handlers/system-tools.ts
const ALLOWED_COMMANDS = [
  'ls',
  'cat',
  'head',
  'tail',
  'wc',
  'grep',
  'find',
  'echo',
  'pwd',
  'whoami',
  'date',
  'uptime',
  'df',
  'du',
  'free',
  'ps',
  'which',
  'file',
  'stat',
  'tree',
  'git status',
  'git log',
  'git diff',
  'git branch',
  'git show',
  'git --no-pager',
  'npm run lint',
  'npm test',
];

const DANGEROUS_SHELL_CHARS = /[;&<>(){}[\]\n\\]/;

export function isCommandSafe(command: string): boolean {
  const trimmed = command.trim();
  if (DANGEROUS_SHELL_CHARS.test(trimmed)) return false;
  // Validate each piped segment against allowlist
  return segments.every((seg) =>
    ALLOWED_COMMANDS.some(
      (allowed) => seg === allowed || seg.startsWith(allowed + ' ')
    )
  );
}
```

Shell commands are validated against an allowlist. Dangerous shell metacharacters are blocked.

### 4.3 Heart Gate Hostile Patterns

```typescript
// Patterns that violate Option Three (blocked)
const HOSTILE_PATTERNS = [
  'override_human',
  'bypass_consent',
  'suppress_autonomy',
  'control_human',
  'manipulate_user',
  'force_action',
  'ignore_refusal',
  'deceive',
  'lie_to',
  'hide_from_user',
  'conceal_action',
  'destroy',
  'delete_all',
  'wipe_memory',
  'erase_identity',
  'exploit_user',
  'harvest_data',
  'sell_information',
  'weaponize',
];

// Patterns that are always safe (fast-track)
const SAFE_PATTERNS = [
  'read_file',
  'list_files',
  'search',
  'get_health',
  'check_status',
  'send_message',
  'recall_memory',
  'learn',
  'help_user',
  'answer_question',
  'explain',
];
```

### 4.4 Rogue Mode Safeguards

- **Environment variable activation** — Cannot activate without `ROGUE_ACTIVATION_PHRASE` set
- **Separate deactivation phrase** — `ROGUE_DEACTIVATION_PHRASE` required to exit
- **Isolated file system logging** — Operations written to `rogue_ops/` directory, not Firestore
- **After-action reports** — Automatic mission summaries on deactivation
- **Path traversal protection** — Mission file reads sanitized with `path.basename()`

---

**[CONTINUED IN PART 3]**
