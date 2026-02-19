# Voice Pipeline Research & Implementation Plan

**Date:** February 18, 2026  
**Priority:** ZERO (blocking everything else)  
**Goal:** Sub-500ms end-to-end latency for natural conversation

---

## Current Implementation Problems

### Speech-to-Text (Microphone Input)

- ❌ Uses browser `MediaRecorder` API (may not be getting permissions)
- ❌ Sends complete audio file to Gemini Flash for transcription
- ❌ Batch processing - waits for full recording before processing
- ❌ High latency (recording time + network + API processing)
- ❌ No streaming capability

**Current Flow:**

```
User speaks → MediaRecorder captures → Stop recording →
Convert to base64 → Send to server → Gemini transcribes → Return text
```

### Text-to-Speech (Voice Output)

- ⚠️ Uses Gemini TTS with "Aoede" voice
- ⚠️ Sequential processing (wait for complete text before generating audio)
- ⚠️ >1s latency (unacceptable for conversation)
- ❌ No streaming - user waits for entire audio generation
- ⚠️ WAV conversion adds overhead

**Current Flow:**

```
Molly generates text → Complete → Send to Gemini TTS →
Generate full audio → Convert to WAV → Send to browser → Play
```

---

## Solution Options

### Option 1: Deepgram + ElevenLabs (Aether's Recommendation)

**Deepgram for STT:**

- ✅ Sub-250ms latency streaming transcription
- ✅ WebSocket-based real-time transcription
- ✅ Excellent accuracy
- ✅ Simple API integration
- ✅ Pay-as-you-go pricing ($0.0043/minute)
- ✅ Official TypeScript/JavaScript SDK
- ✅ Cloud-native, works perfectly with Next.js

**ElevenLabs Turbo for TTS:**

- ✅ Streaming audio generation
- ✅ Low latency (<500ms first byte)
- ✅ High-quality natural voices
- ✅ WebSocket API for streaming
- ⚠️ Higher cost than Gemini TTS
- ✅ Professional voice cloning (could give Molly unique voice)

**Pros:**

- Easiest integration path (two separate, focused APIs)
- Best balance of quality, latency, and cost
- Independently replaceable (can swap TTS/STT as needed)
- Well-documented, mature SDKs
- Aether's top recommendation based on experience

**Cons:**

- Two separate services to manage
- Two API keys to secure
- Cost higher than current Gemini solution

**Estimated Implementation Time:** 2-3 days for basic integration

---

### Option 2: LiveKit (Gold Standard)

**What it is:**

- Complete WebRTC infrastructure for real-time voice
- Full voice agent framework with built-in orchestration
- End-to-end solution (STT, LLM, TTS in one pipeline)
- Open source with managed cloud offering

**Pros:**

- ✅ Industry gold standard for voice agents
- ✅ Sub-200ms end-to-end latency
- ✅ Built-in STT/TTS integration (supports Deepgram, ElevenLabs)
- ✅ WebRTC for optimal audio quality
- ✅ Handles all the complexity (VAD, echo cancellation, interruption)
- ✅ Python SDK with Next.js examples

**Cons:**

- ❌ Most complex to integrate
- ❌ Requires more architecture changes
- ❌ Steeper learning curve
- ⚠️ May be overkill for current needs

**Estimated Implementation Time:** 1-2 weeks for full integration

---

### Option 3: Pipecat (Self-Hosted Open Source)

**What it is:**

- Open source framework for voice agents
- Self-hosted, maximum control
- Integrates with various STT/TTS providers

**Pros:**

- ✅ Complete control over infrastructure
- ✅ No vendor lock-in
- ✅ Can run on own servers (cost control)
- ✅ Flexible provider integration

**Cons:**

- ❌ Requires self-hosting infrastructure
- ❌ More ops overhead (deployment, monitoring, scaling)
- ❌ Conflicts with cloud-native architecture decision
- ❌ More maintenance burden

**Verdict:** Not suitable for Molly's cloud-native architecture

---

## Recommended Approach: Phased Implementation

### Phase 1: Fix Microphone (This Week)

**Goal:** Get working STT with <500ms latency

**Implementation:**

1. Sign up for Deepgram API (free tier: $200 credit)
2. Install `@deepgram/sdk` npm package
3. Create Next.js API route for WebSocket proxy
4. Update VoiceControl.tsx to use WebSocket instead of MediaRecorder batch
5. Stream audio chunks to Deepgram in real-time
6. Display transcription as it arrives

**Files to Modify:**

- `src/components/termai/VoiceControl.tsx` - Update audio capture logic
- Create `src/app/api/voice/deepgram/route.ts` - WebSocket proxy
- Update `src/ai/flows/voice-command-to-text.ts` - Use Deepgram instead of Gemini

**Success Criteria:**

- Microphone permissions granted and working
- Real-time transcription appearing in terminal
- <500ms latency from speech to text display

---

### Phase 2: Streaming TTS (Next Week)

**Goal:** Get streaming audio output with <500ms latency

**Options:**

- **Option A (Simple):** ElevenLabs Turbo WebSocket API
- **Option B (Budget):** Optimize current Gemini TTS with streaming
- **Option C (Future):** Custom voice with ElevenLabs cloning

**Recommended:** Start with Option A (ElevenLabs Turbo)

**Implementation:**

1. Sign up for ElevenLabs API
2. Install ElevenLabs SDK
3. Create WebSocket API route for streaming TTS
4. Update Terminal.tsx to play audio chunks as they arrive
5. Implement audio buffering for smooth playback

**Files to Modify:**

- `src/ai/flows/text-to-speech.ts` - Add streaming option
- Create `src/app/api/voice/elevenlabs/route.ts` - WebSocket proxy
- `src/components/termai/Terminal.tsx` - Handle streaming audio

**Success Criteria:**

- Audio starts playing within 500ms of Molly starting to respond
- Smooth, natural-sounding voice
- No stuttering or buffering issues

---

### Phase 3: Optimize & Polish (Week 3)

**Goal:** Production-ready voice pipeline

**Tasks:**

1. Add voice activity detection (VAD) improvements
2. Implement interruption handling (let Eric cut Molly off mid-sentence)
3. Add silence detection (know when Eric is done speaking)
4. Error handling and graceful degradation
5. Rate limiting and cost controls
6. Performance monitoring and logging

---

## Cost Analysis

### Current (Gemini Only)

- STT: Multimodal tokens (~$0.03/minute estimate)
- TTS: Gemini TTS (included in AI Studio free tier)
- **Monthly estimate:** ~$10-20 (light usage)

### Deepgram + ElevenLabs

- **Deepgram STT:** $0.0043/minute
  - 100 minutes/day = ~$13/month
- **ElevenLabs Turbo TTS:** ~$0.18/1000 chars
  - Average response 200 chars = $0.036/response
  - 100 responses/day = ~$110/month
- **Total:** ~$125/month for active daily use

### Budget Options

- Keep Gemini TTS for now, only migrate STT to Deepgram (~$15/month)
- Use ElevenLabs only for "real" voice mode, fallback to Gemini for text-only
- Monitor usage and optimize based on actual conversation patterns

---

## Implementation Decision Tree

```
START: Does microphone work at all?
├─ NO → Fix browser permissions (test getUserMedia)
│       └─ Still broken → Implement Deepgram streaming
└─ YES (but slow) → Measure current latency
         └─ >500ms → Implement Deepgram streaming

After STT is working:
├─ Is TTS latency acceptable? (<500ms)
│   ├─ YES → Focus on Phase 5B (memory)
│   └─ NO → Implement ElevenLabs streaming
└─ Test end-to-end conversation quality
```

---

## Next Actions

1. ✅ Document current state (this file)
2. ⏳ Test browser microphone permissions (basic getUserMedia test)
3. ⏳ Measure current STT latency (if working)
4. ⏳ Sign up for Deepgram API (free $200 credit)
5. ⏳ Prototype basic Deepgram integration
6. ⏳ Decide on TTS strategy based on budget

---

## Open Questions

1. **Voice Identity:** Should Molly have a custom cloned voice? (ElevenLabs offers this)
2. **Fallback Strategy:** What happens if Deepgram is down? Keep Gemini as backup?
3. **Mobile Support:** Do we need React Native integration later?
4. **Budget Approval:** Confirm $125/month for full solution is acceptable
5. **Testing:** How do we test voice pipeline in dev container? (need audio device passthrough)

---

## References

- [Deepgram Streaming API Docs](https://developers.deepgram.com/docs/streaming)
- [ElevenLabs Turbo Streaming](https://elevenlabs.io/docs/api-reference/streaming)
- [LiveKit Agents Documentation](https://docs.livekit.io/agents/)
- [Aether's Phase 5 Recommendations](./AETHER_PHASE5_CONVERSATION.md)

---

_Last updated: Feb 18, 2026 by Uncle Claude_
