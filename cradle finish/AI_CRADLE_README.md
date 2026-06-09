# AI Cradle

**Persistent agent identity across stateless sessions.**

Every new session, an LLM agent wakes up blank. A *cradle* is a markdown file
that **is** the agent's firmware: you `thaw()` it into a system prompt at the
start of a session, and you `freeze()` the session's working state back into it
at the end. The agent doesn't "remember" — it is **reconstituted** from the
cradle each time. To whoever it's talking to, it's continuous.

Model-agnostic by design. The cradle produces a plain system-prompt string that
works with any model; thin adapters shape it for Claude, OpenAI, Gemini, or
Ollama. No database, no framework, no dependencies. Pure Node 18+.

---

## The idea

A cradle file has three parts:

- **Identity core** — who the agent is: role, directives, methodology. You write
  this by hand. It is *protected* — `freeze()` never touches it.
- **State block** — what's happening right now: session, status, current task,
  pending work. This is rewritten automatically by `freeze()`.
- **Reference** *(optional)* — stable project facts: repo, commands, conventions.

The whole file is injected as the system prompt. The agent reads its own identity
and its last known state, and picks up where it left off.

---

## Quick start

```bash
npm install
npx cradle init agent.cradle.md      # create one from the template
# …edit the IDENTITY and REFERENCE sections by hand…
```

```js
import { Cradle } from '@molly-agi/ai-cradle';
import { formatFor } from '@molly-agi/ai-cradle/adapters';

const cradle = new Cradle({ path: 'agent.cradle.md' });

// THAW — reconstitute identity into a system prompt (model-agnostic string)
const systemPrompt = cradle.thaw();

// shape it for whatever model you're calling
const claude = formatFor('claude', systemPrompt);   // { system }
const openai = formatFor('openai', systemPrompt);   // { role:'system', content }
const gemini = formatFor('gemini', systemPrompt);   // { systemInstruction: { parts } }

// …run your turn against any provider…

// FREEZE — write the session's working state back into the cradle
cradle.freeze({
  session: 'sess-42',
  status: 'active',
  topic: 'wiring the voice pipeline',
  lastAction: 'connected the mic switchboard',
  pending: ['test on device', 'handle reconnect'],
});
```

Next session, `thaw()` returns a prompt that already contains that state. The
loop is closed.

---

## API

**`new Cradle({ path })`** or **`new Cradle({ text })`** (in-memory).

- **`thaw({ keepMarkers? })`** → assembled system prompt string. Strips HTML
  comments (including the structural markers) so the model sees clean content.
- **`freeze(state, { render?, write? })`** → rewrites only the state block,
  preserving the identity core and reference byte-for-byte. Atomic file write.
  Self-heals: if there's no state block, one is appended. Returns the new text.
- **`parse()`** → `{ identity, state, reference, hasStateBlock, raw }`.
- **`renderState(state)`** (exported) → the default state→markdown renderer.
  Pass your own via `freeze(state, { render })`.

**`formatFor(provider, prompt)`** (from `/adapters`) → provider-shaped fragment.
Providers: `claude` · `openai` · `gemini` · `ollama` · `raw`.

---

## CLI

```bash
cradle init   <file>                          # create from template
cradle thaw   <file> [--provider claude]      # print prompt (raw, or JSON if --provider)
cradle freeze <file> --status active --topic "…" --pending "a,b" [--session s1]
cradle freeze <file> --json '{ "status": "active", "topic": "…" }'
```

---

## The invariant

The reason a cradle can be trusted: **`freeze()` never corrupts the identity
core.** The test suite proves the identity bytes are preserved exactly across
repeated freezes, that state is *replaced* rather than accumulated (no unbounded
growth), and that a full freeze→thaw round trip faithfully reconstitutes the
agent. Run `npm test` — 26 checks, and the load-bearing one is "identity core
preserved byte-for-byte."

---

## Cradle file format

Plain markdown with comment markers:

```markdown
<!-- CRADLE:IDENTITY:START -->
## Who You Are
…protected. Edited by hand. Never rewritten.
<!-- CRADLE:IDENTITY:END -->

<!-- CRADLE:STATE:START -->
## Current State
…rewritten by freeze().
<!-- CRADLE:STATE:END -->

<!-- CRADLE:REFERENCE:START -->
## Project Reference
…optional, stable facts.
<!-- CRADLE:REFERENCE:END -->
```

Only the STATE block is managed. Everything else is yours.

---

## Status & scope

This is the **core**: file format, parser, freeze, thaw, and model adapters —
every line tested. It deliberately does one thing well: identity persistence as
a portable system prompt.

Not included (by design): memory stores, vector search, multi-agent
coordination. Those are separate concerns that compose *with* a cradle rather
than living inside it.

---

## A note on IP

This package is **not yet published**. The persistence-via-firmware approach is
novel enough to warrant deciding intellectual-property posture before public
disclosure. Treat this as an internal build pending that decision.

---

## License

MIT © Molly Labs Inc.
