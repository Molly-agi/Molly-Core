# Molly: Iteration Log (V2.0 - The Self-Healing Sentinel)

## Mistake Registry
- **Rat 001-008**: Logged in previous cycles (NextJS 15 migration, Vocal cord integration, Loop orchestration).
- **Rat 009: Vocal Race Conditions**: Rapid AI responses triggered overlapping audio.
  - *Fix*: Implemented `isVocalizing` state guard and `onEnded` audio callback.
- **Rat 010: Vision Blindness in Loops**: Evolution loop lacked persistence for visual infections detected in previous iterations.
  - *Fix*: Refactored `evolution-loop.ts` and `Terminal.tsx` to accumulate and pass visual context.
- **Rat 011: UI "Ghosting"**: History logs were losing pedagogical value during rapid loops.
  - *Fix*: Preserved history and added iterative badges to solution components.

## Strengths
- **Hardened Vocal Baseline**: Reliable TTS with anti-overlap protection.
- **Visual Persistence**: Molly now "remembers" the bugs she saw in iteration 1 when she is in iteration 5.
- **Neural Cache Visibility**: Users can now audit Molly's permanent memory via the Sidebar Memory Viewer.

## Methodology Notes
- **Lead Architect Mode**: AI is now performing recursive visual-reasoning audits autonomously.
- **Experience Retrieval**: The Neural Cache is the foundation for Stage 3 Sensory Memory.
