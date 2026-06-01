# Session-Scoped Hook System

## Overview

Session-scoped hooks allow skills and agents to register actions (commands, scripts, or functions) that are triggered by specific events during a session. Hooks are isolated to a session and can be dynamically registered, executed, and removed.

## Key Concepts

- **Session Isolation:** Hooks are tied to a sessionId and do not leak between sessions.
- **Events:** Any string can be an event (e.g., 'PreToolUse', 'Stop').
- **Matchers:** Hooks can specify a matcher (glob or regex) to filter which events or targets they respond to.
- **One-shot Hooks:** Hooks can be set to auto-remove after firing once.
- **Execution:** Hooks can execute shell commands, scripts, or (with extension) JS functions.

## API

### Register Hooks

```ts
registerSessionHooks(sessionId: string, hooks: HooksSettings, source: string)
```

- `sessionId`: Unique session identifier
- `hooks`: Object mapping event names to arrays of { matcher, hooks }
- `source`: Name of the skill or agent registering the hook

### Unregister Hooks

```ts
unregisterSessionHooks(sessionId: string)
```

Removes all hooks for a session.

### Execute Hooks

```ts
executeHooks(event: HookEvent, payload: unknown, sessionId: string)
```

Finds and executes all hooks for the given event and session. Only hooks whose matcher matches the event or payload will run.

### List Hooks

```ts
listSessionHooks(sessionId?: string)
```

Returns all hooks for a session (or all sessions if no id given).

## Matcher Logic

- If matcher is '\*' or '', hook always runs.
- If payload has a `target` property, matcher is tested against it (glob and regex).
- Otherwise, matcher is tested against the event name.

## Example

```ts
const hooks = {
  PreToolUse: [{ matcher: '*', hooks: [{ command: 'echo pre', once: true }] }],
  Stop: [{ matcher: 'critical*', hooks: [{ command: 'echo stop' }] }],
};
registerSessionHooks('session-123', hooks, 'my-skill');
executeHooks('PreToolUse', { target: 'file.txt' }, 'session-123');
```

## Extending

- To support JS function hooks, add a `type` field to HookCommand and handle accordingly in `executeHooks`.
- For persistence, serialize `sessionHooks` to disk or a database.

## Auditability

- All hook registration, execution, and removal is logged to the console.
- Use `listSessionHooks()` for debugging and UI.

---

_See src/hooks/sessionHooks.ts for implementation details._
