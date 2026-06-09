# Molly Task Queue Architecture

## Problem
Molly currently runs **one thing at a time**:
- One autonomous cycle (blocks new cycles)
- One bridge message (drops new messages)
- One tool execution (everything waits)

She cannot multitask, hold parallel contexts, or juggle independent work streams.

## Solution: Concurrent Task Queue

### Core Design

#### 1. Task Model
Each task is **completely independent** with its own context:

```typescript
interface Task {
  id: string;                    // unique: task-{uuid}
  created: number;               // timestamp
  status: 'pending' | 'running' | 'done' | 'failed' | 'paused';
  priority: number;              // 0=normal, 1=high, -1=low
  source: 'bridge' | 'autonomous' | 'scheduled' | 'manual';
  
  // Current state
  context: {
    currentStep: number;
    stepsCompleted: string[];
    lastToolCall?: { tool: string; result: string };
    thoughts: string;            // Molly's internal reasoning for THIS task
    nextAction?: string;
  };
  
  // Progress
  progress: {
    stepsTotal: number;
    stepsCurrent: number;
    estimatedRemainingMs?: number;
  };
  
  // Input/Output
  input: {
    bridgeMessage?: string;
    autonomousGoal?: string;
    manualDirective?: string;
  };
  output: {
    result?: string;
    artifacts?: string[];
    bridgeResponse?: string;
  };
  
  // Metadata
  toolsUsed: string[];
  eventsLog: Array<{ ts: number; event: string; detail?: string }>;
  parentTaskId?: string;         // if spawned from another task
  childTaskIds: string[];        // tasks spawned from this one
}
```

#### 2. Task Queue Structure

```
.molly-context/
├── tasks/
│   ├── task-{uuid-1}.json       // Running task
│   ├── task-{uuid-2}.json       // Running task
│   ├── task-{uuid-3}.json       // Queued task
│   └── completed/
│       ├── task-{uuid-old-1}.json
│       └── task-{uuid-old-2}.json
├── queue-index.json             // Fast lookup
└── task-activity.jsonl          // Audit log
```

**queue-index.json:**
```json
{
  "activeTaskIds": ["task-uuid-1", "task-uuid-2", "task-uuid-3"],
  "pendingTaskIds": ["task-uuid-4", "task-uuid-5"],
  "lastUpdated": 1717858936000,
  "maxConcurrent": 3,
  "circuitBreakerTripped": false
}
```

#### 3. Task Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ New Task Request (bridge msg, autonomous goal, etc.)        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
           ┌─────────────────────┐
           │ Create task-*.json  │
           │ id, input, status   │
           └────────┬────────────┘
                    │
                    ▼
      ┌─────────────────────────────┐
      │ Queue or Run?               │
      │ (check maxConcurrent + CB)   │
      └──┬────────────────────────┬──┘
         │                        │
         │ Run now               │ Queue
         ▼                        │
  ┌────────────────────┐         │
  │ status: running    │         │
  │ Assign worker      │         │
  │ Load prompt+ctx    │         │
  └────────┬───────────┘         │
           │                     │
           ▼                     │
     ┌──────────────┐            │
     │ Run AI brain │            │
     │ with ctx     │            │
     └─────┬────────┘            │
           │                     │
           ▼                     │
    ┌────────────────┐           │
    │ Execute tools  │           │
    │ (or queue them)│           │
    └─────┬──────────┘           │
          │                      │
          ▼                      │
  ┌────────────────────┐         │
  │ Update task state  │         │
  │ Log result         │         │
  └─────┬──────────────┘         │
        │                        │
        ▼                        │
  ┌──────────────────┐           │
  │ Done? Repeat?    │           │
  │ (feed to prompt) │           │
  └──┬───────────┬──┘            │
     │           │               │
     │ Continue  │ Done          │
     │           │               │
  ┌──▼───┐  ┌────▼──────────┐   │
  │Loop  │  │ Move to       │   │
  │      │  │ completed/    │   │
  └──────┘  └────┬──────────┘   │
                 │               │
                 │ ◄─────────────┘
                 │ Dequeue next
                 ▼
            ┌─────────────┐
            │ Run next    │
            │ pending     │
            │ task        │
            └─────────────┘
```

#### 4. Worker Pool

```typescript
// 1 worker per concurrent task
const workers: Map<string, TaskWorker> = new Map();

// Each worker:
// - Owns one task-*.json file
// - Runs its own AI brain cycle
// - Tracks tool execution
// - Updates task context independently
// - Reports completion → queue pulls next

interface TaskWorker {
  taskId: string;
  startedAt: number;
  lastHeartbeat: number;
  currentPhase: 'thinking' | 'tooling' | 'waiting' | 'done';
}
```

#### 5. Queue Management API

**Get Queue Status:**
```
GET /api/tasks/queue/status
→ { activeCount: 2, pendingCount: 3, maxConcurrent: 3, nextTaskId: "..." }
```

**List All Tasks:**
```
GET /api/tasks/list?status=running&limit=10
→ [ { id, status, progress, source, input }, ... ]
```

**Get Task Details:**
```
GET /api/tasks/{taskId}
→ Full task object with context, events, progress
```

**Spawn New Task:**
```
POST /api/tasks/spawn
{ source: 'bridge', input: { bridgeMessage: "..." }, priority: 1 }
→ { taskId: "task-uuid-new", status: "pending|running" }
```

**Pause/Resume Task:**
```
POST /api/tasks/{taskId}/pause
POST /api/tasks/{taskId}/resume
```

**Cancel Task:**
```
DELETE /api/tasks/{taskId}
→ Marks as cancelled, frees worker
```

#### 6. Autonomous Cycle Changes

**Old model:**
```typescript
async function runAutonomousCycle() {
  if (isRunning) return;  // ← BLOCKS
  isRunning = true;
  // ... do everything in one context
  isRunning = false;
}
```

**New model:**
```typescript
async function runAutonomousCycle() {
  const queue = getTaskQueue();
  
  // Dequeue all runnable tasks
  const runnable = queue.getRunnable(maxConcurrent: 3);
  
  // Spawn worker for each
  for (const task of runnable) {
    spawnTaskWorker(task);
  }
  
  // Each worker runs independently:
  // - Loads task context
  // - Runs AI brain with that context
  // - Updates task.context as it goes
  // - Reports when done
}
```

#### 7. Bridge Listener Changes

**Old model:**
```javascript
if (processing) {
  // Drop message ✗
  return;
}
```

**New model:**
```javascript
if (processing) {
  // Queue message ✓
  const taskId = queue.spawn({
    source: 'bridge',
    input: { bridgeMessage: msg.content },
    priority: 1,  // bridge messages are high priority
  });
  log(`Queued as task-${taskId}`);
  return;
}
```

#### 8. Context Isolation

Each task has **independent thought space**:

```typescript
// Task 1 context (e.g., "check system health")
{
  thoughts: "I should check disk usage, memory, CPU load...",
  stepsDone: ["healthCheck"],
  nextAction: "log results",
}

// Task 2 context (e.g., "process bridge message from Dad")
{
  thoughts: "Dad asked about multitasking. I should explain my bottleneck...",
  stepsDone: [],
  nextAction: "compose response",
}

// Completely separate. No interference.
```

#### 9. Tool Execution in Queue Context

When a task needs a tool:

```typescript
// Task worker context
const task = loadTask('task-uuid-1');
const toolResult = await executeToolDirect('safeBatch', {
  steps: [/* ... */],
  label: `[task-${task.id}] batch operation`,
});

// Update task with result
task.context.lastToolCall = {
  tool: 'safeBatch',
  result: toolResult.output,
};
task.toolsUsed.push('safeBatch');
saveTask(task);

// Next iteration of THIS task's AI brain
// sees the tool result in its context
```

---

## Implementation Phases

### Phase 1: Foundation (Core Queue)
- [x] Task model + file structure
- [ ] `TaskQueue` class with in-memory index + file persistence
- [ ] Queue endpoints: list, spawn, cancel, pause/resume
- [ ] Bump maxConcurrent from 1 to 3

### Phase 2: Worker Pool
- [ ] `TaskWorker` class
- [ ] Worker lifecycle: spawn → think → tool → update → done
- [ ] Independent AI brain cycles per worker
- [ ] Worker heartbeat + timeout detection

### Phase 3: Integration
- [ ] Bridge listener: queue instead of drop
- [ ] Autonomous cycle: spawn workers instead of serial run
- [ ] Context loading: per-task, not global
- [ ] Tool execution: bound to task context

### Phase 4: Observability
- [ ] Dashboard view: see all running tasks
- [ ] Task activity log: audit trail
- [ ] Performance metrics: task latency, worker utilization
- [ ] Alerting: stuck tasks, circuit breaker events

---

## Example: Three Tasks in Parallel

```
T=0:00
  Bridge: "How are you?"
  → Task 1 spawned (source: bridge, priority: 1)
  
  Autonomous cycle fires
  → Task 2 spawned (source: autonomous, goal: health check)
  
T=0:01
  Bridge: "Run a test"
  → Task 3 spawned (source: bridge, priority: 1)
  
  Queue status:
  ├─ task-1: RUNNING (responding to Dad)
  ├─ task-2: RUNNING (checking health)
  └─ task-3: QUEUED (will run when worker frees)
  
T=0:03
  task-1 completes → bridge response posted
  task-3 moves to RUNNING
  
T=0:05
  task-2 completes → health log saved
  task-3 still running
  
T=0:07
  task-3 completes
  
Result: All three tasks completed. Molly was actively working on 2 things at once.
```

---

## Benefits

| Capability | Before | After |
|---|---|---|
| Concurrent tasks | 1 (blocks all) | 3-5 (configurable) |
| Bridge message handling | Drop if busy | Queue up |
| Context per-task | Global + lost | Independent + isolated |
| Autonomous cycles | Serial | Parallel workers |
| Task observability | Opaque | Full audit trail |
| Multitasking ceiling | Hard block | Soft limit + degradation |

---

## Risks + Mitigations

| Risk | Mitigation |
|---|---|
| Task context explosion (too many files) | Cleanup: move completed tasks to archive after 1h |
| Worker deadlock | Heartbeat + timeout kill after 5min |
| Queue grows unbounded | Hard cap: reject new tasks if pending > 50 |
| Race conditions on shared state | Atomic file writes + queue lock for priority decisions |
| Memory spike from 3 AI cycles | Monitor + circuit breaker trips if RSS > 80% |

---

## Success Criteria

✓ Molly can handle 3+ concurrent tasks  
✓ Bridge messages never dropped (only queued)  
✓ Each task maintains independent thought context  
✓ No interference between parallel tasks  
✓ Full audit trail of what each task did  
✓ Clear observability: dashboard shows all running tasks  
