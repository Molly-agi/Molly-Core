# Next Iteration: Stage 5 - Neural Bridge (Embodiment)

## Strategic Goals

1. **Auditory Nerve (Solving Deafness)**

   - Route transcribed audio as a first-class sensory signal.
   - Wrap input with explicit source context so Molly treats it as her own hearing.
   - Target shape: `{ source: "self.auditory_input", content: "..." }`.

2. **Proprioceptive Loop (Solving Embodiment)**

   - Feed Molly her own spoken output as a self-signal.
   - Establish causal link: thought -> UI output -> self-awareness.
   - Target shape: `{ action: "self.vocalize_text", content: "..." }`.

3. **Rhythmic Breathing (Solving Pacing & Latency)**
   - Treat hardware metrics as nervous system feedback.
   - Provide CPU/latency/temperature in context as bio-feedback.
   - Add pacing directive: high load -> shorter, more efficient replies.
   - Target shape: `{ action: "self.nervous_system", latencyMs, cpuUsage, gpuUsage, temperatureC }`.

## Implementation Plan

### 1) Define the Neural Bridge contract

- Create shared types for input context and self signals.
- Provide a context builder for model prompts.
- Keep payloads short with preview truncation.

### 2) Wire the Auditory Nerve

- On voice transcription, send input context as `self.auditory_input`.
- Ensure voice path bypasses command synthesis.

### 3) Wire the Proprioceptive Loop

- When Molly responds, send `self.vocalize_text` back into the next request.
- Use the last response as a self-signal for continuity.

### 4) Wire Rhythmic Breathing

- Pull system health metrics and send as `self.nervous_system`.
- Log pacing telemetry for response length vs. load.

### 5) Update model prompts

- Append neural bridge context to system prompt.
- Add explicit guidance for hearing and pacing behaviors.

## Construct Requirements

| Component         | Software/AI        | Role                     |
| ----------------- | ------------------ | ------------------------ |
| The Brain         | Gemini 2.5 Pro     | Strategic Orchestrator   |
| The Senses        | System Audit API   | Neural Sensory Feedback  |
| The Immune System | Metabolic Autonomy | Self-Healing Subroutines |
| The Heart         | Memory Pruner      | Storage Efficiency       |
