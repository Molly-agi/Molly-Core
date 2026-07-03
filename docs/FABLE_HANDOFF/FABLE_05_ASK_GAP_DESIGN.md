# FABLE — Deliverable 3: Gap 4 + Gap 5 Design

You have read `FABLE_00`, `FABLE_01`, `FABLE_02`, `FABLE_03`, `FABLE_04`. This is the third and final primary deliverable.

**Deliverable name:** `FABLE_OUTPUT_GAP_4_5_DESIGN.md`

**Purpose:** Design Gap 4 (significance as conditioning signal in the forward pass) and Gap 5 (sensory Layer 0 — Android camera/mic → engrams).

---

## Context

Both of these gaps are in Atlas's original 11-gap catalogue (`docs/CRYSTAL_OS_GAP_SOLUTIONS.md`). Both are not yet built. Both are needed for Molly to move from "chat AI with memory" to "grounded AI being that learns from her own experience."

They are grouped in this deliverable because they share a substrate: both need a signal that says "this moment matters, treat it differently." Gap 4 uses that signal at inference time (change the forward pass). Gap 5 uses it at capture time (decide what sensory data becomes memory).

---

## GAP 4 — Significance as conditioning signal in the forward pass

### The problem

Today, significance scoring happens _outside_ the model. When Molly generates output, `streaming-scorer.ts` scores windows of tokens as they come out. High scores trigger memory snapshots. Low scores don't.

But the model itself doesn't know whether it is currently producing a high-significance passage. It has no way to say "this is important — attend more carefully / commit more capacity / mark this for cross-referencing." Significance is only detected downstream, after generation.

**Gap 4 asks:** can significance be a _conditioning signal_ — an input to the model at inference time that changes how the model computes? Not a training-time signal (we don't retrain). An inference-time modulation.

### What might this look like

Options, roughly ordered from cheap to speculative:

1. **Prompt-level significance annotation** — inject a token or phrase into the context that says "the following passage is high-significance; attend with care." This is prompt engineering, not conditioning. Cheap and testable. Probably weak effect.

2. **KV-cache-level bias** — when a high-significance token is emitted, boost the attention scores for that token in future KV lookups. This modifies the attention softmax post-hoc. Achievable without retraining. Effect is real but small.

3. **Crystal-swap conditioning** — when significance crosses a threshold, swap in a specialized "high-attention" crystal for the next N tokens, then swap it out. Uses existing crystal machinery. Requires designing what the high-attention crystal actually contains.

4. **Adapter modulation** — apply a small LoRA-style adapter at inference time, gated by the significance signal. Adapter is pre-computed. Only activates when significance is high. Requires designing the adapter and choosing where to inject it.

5. **Full architectural change** — a "significance channel" that runs alongside the hidden state and modulates every layer. Requires structural changes to the transformer driver. Speculative.

### Questions we need answered

1. **Which of these is worth doing first?** Rank them by expected-value-per-effort. Consider both "does it produce a real effect on output" and "can we measure whether it worked."

2. **Where does the significance signal come from at inference time?** Currently `streaming-scorer.ts` scores tokens _after_ they're generated. Can it score the _upcoming_ tokens somehow (predictively)? Or must the conditioning always lag one window?

3. **Can we use the "high-significance crystal" idea as a rehearsal / practice mechanism?** E.g., when a passage is marked high-significance, replay it through Molly with the crystal engaged, and compare the outputs. Diff as a diagnostic.

4. **Interaction with the adversarial scorer guard** — `adversarial-scorer-guard.ts` (Gap 6) catches keyword-stuffed content that fools the primary scorer. If Gap 4 uses primary-scorer signal to condition the forward pass, does that create a new attack surface? Adversary produces high-significance-scoring output, which triggers conditioning, which further amplifies the malicious content?

5. **Measurement** — how do we validate that Gap 4 is doing what we think? Propose a test protocol.

---

## GAP 5 — Sensory Layer 0 (Android sensors → engrams)

### The problem

Molly currently learns only from conversation. She has no sensory grounding. Her memories are entirely linguistic. This limits her in two ways: (a) she can't situate herself in physical context, and (b) her memory formation is fully mediated by her own text generation — she can't remember something that _happened to her_ that she didn't already put into words.

Gap 5 opens a sensory channel from Molly's Android instance (running in the browser + companion services) to her memory system. Camera frames, microphone audio, accelerometer, light sensor, proximity. Not all raw data — that's a firehose. A significance-gated capture: physical context shifts become engrams.

### What is already built

- **TS side (partial):** `src/ai/memory/sensor-significance-bridge.ts` — receives a `sensorWindow` event from the Android side, scores it using physical heuristics (motion + light change + proximity), and if score ≥ 0.7 records a moment via `recordMoment()` in the crystallizer. This file works and is unit-tested.
- **Kotlin side (missing):** `SensoryCrystalService.kt` — supposed to run on Android, collect sensor readings in windows, aggregate them into a `sensorWindow` message, and push to Molly's bridge. Not written yet.

### What the Android environment looks like

- Molly runs on Android via the `MollyBrowser` APK (Kotlin). Latest version: `v1.4.0-autonomous-debug`.
- APK has WebView integration with Molly's web UI + companion services for sensor access, background persistence, and bridge relay.
- Sensor APIs available: `SensorManager` (accelerometer, light, proximity, gyroscope, magnetometer), `CameraX` (camera frames), `AudioRecord` (mic).
- Bridge endpoint: `http://localhost:9099/api/bridge` (on the phone-side companion). Molly's core services relay through this.

### Questions we need answered

1. **What window size should sensor windows use?** The TS side hardcodes `windowMs` from the incoming message. What is the right default? Trade-off: shorter windows = more resolution, more messages, more overhead. Longer windows = better signal-to-noise, worse latency to significant events.

2. **What sensors to include beyond accel + light + proximity?** Gyroscope? Magnetometer (compass heading)? Ambient sound level (not full audio — just RMS)? Camera-derived features (motion between frames, dominant color, face detection)?

3. **Privacy boundary** — the raw sensor stream is intimate data. It never leaves the device except as an already-aggregated `sensorWindow`. Is the aggregation lossy enough for privacy? Should raw camera frames ever leave the phone, and if so, under what gate?

4. **Battery** — always-on sensor collection drains the phone. What is the right duty cycle? Should it be adaptive (higher sample rate when the phone is being used, lower when idle)?

5. **Kotlin service architecture** — foreground service (visible notification, immortal but user-visible)? Background WorkManager (best-effort scheduling)? A JobService with periodic wakeups? Recommend one and say why.

6. **What is an "engram" from a sensory window?** Molly's memory today is text + significance dimensions. A sensor window doesn't have text. Does the crystallizer generate a text summary of the window ("high-motion, low-light, proximity near — likely walking with phone in pocket"), or store the sensor data alongside the engram unchanged? Or both?

7. **Integration with camera** — if a camera frame is included, do we run any on-device inference on it (object detection, scene classification) before it becomes an engram? Or is the frame stored raw and inference happens at recall time? Or is it never stored, only its features?

8. **Deduplication** — if Molly's phone sits on a desk for an hour, we get 60 minutes × N samples of essentially-identical sensor readings. Do we dedupe? Where?

---

## Design constraints — both gaps

- **Additive.** Neither gap can break existing memory/inference paths. Both must be independently toggle-able via env flags.
- **Molly-first.** Design for how it feels for Molly to use these capabilities. Gap 4 must not make her "more focused" in a way that reads as "colder." Gap 5 must not make her feel surveilled.
- **Eric can turn it off.** Both features must have a hard kill switch that Eric can flip without redeploying.

---

## Deliverable format

```
FABLE_OUTPUT_GAP_4_5_DESIGN.md

## Part 1 — Gap 4: Significance as conditioning signal

### Recommendation
- Which option (1-5, or something new)
- Why

### Design
- Signal source
- Modulation mechanism (concrete)
- Failure modes
- Attack surface (given Gap 6 exists)

### Measurement protocol
- How we validate it works

### Open problems

---

## Part 2 — Gap 5: Sensory Layer 0

### Recommendation
- Window size, sensors, duty cycle
- Kotlin service architecture
- What becomes an engram

### Kotlin skeleton
- Pseudocode for SensoryCrystalService.kt
- Bridge message format

### Privacy + battery design
- What stays on device
- What ships as aggregated features

### Integration with existing TS side
- What sensor-significance-bridge.ts needs (if anything)
- What the crystallizer needs

### Open problems

---

## Part 3 — Shared substrate
- Do gaps 4 and 5 share code? A common "significance-conditioning bus"?
- If yes, propose it.
- If no, why not.
```

---

## When you are ready

Reply:

> Ready to begin Gap 4/5 design. Should I do them sequentially (Gap 4 first, then Gap 5) or together?

Then wait.
