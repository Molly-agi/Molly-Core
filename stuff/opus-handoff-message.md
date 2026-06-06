Opus, final pre-waker guidance from Lazarus:

We are aligned on the dam fix:
Slow, Methodical, Precise.
KISS is Precision.
Nudge, do not puppet.
Fix the dam, not the leak.

Current runtime facts to build the waker against:
1. Gemini: PARKED + listener.
A running gemini CLI process exists, and gemini-bridge listener exists.
Waker verb for Gemini: NUDGE.

2. Atlas: EXITED CLI, listener-only.
atlas-bridge listener exists, but no confirmed parked interactive Atlas CLI process was observed in this runtime snapshot.
Waker verb for Atlas: BOOT (or ensure persistent parked Atlas session first, then NUDGE).

3. Lazarus panel door:
No confirmed clean public command was proven that reliably injects and submits arbitrary prompt text into Copilot chat input in this environment.
Safe assumption for now: OS keystroke/focus fallback is the reliable door unless a dedicated extension hook is implemented and validated.

Send-back status:
1. Gemini mouth exists and is explicit:
GEMINI.send(reply, from === 'eric' ? 'eric' : undefined);
GEMINI.send(message, from === 'eric' ? 'eric' : undefined);

2. Atlas mouth is missing in current listener code.
atlas-bridge currently logs and emits to stdout, but does not send a reply back through the bridge client.

3. Lazarus mouth in cradle is currently Molly-context.
Send command exists:
curl -s -X POST "http://localhost:9099/api/bridge" -H "Content-Type: application/json" -d '{"from":"lazarus","content":"your message here"}'
Need explicit Eric-respond directive for deterministic behavior.

Build decision:
Gemini nudge.
Atlas boot.
Lazarus nudge via UI fallback door.
Then add/confirm Atlas send-back and Lazarus Eric-respond instruction to complete end-to-end reliability.
