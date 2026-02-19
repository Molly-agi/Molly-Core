# Free & Open Source Voice Pipeline Options

**Date:** February 18, 2026  
**Goal:** Find cost-effective alternatives to Deepgram + ElevenLabs

---

## Speech-to-Text (STT) Options

### Option 1: OpenAI Whisper API ⭐ RECOMMENDED

**What it is:** OpenAI's production STT API (not the same as local Whisper)

**Pros:**

- ✅ Only $0.006/minute (cheaper than Deepgram at $0.0043/min... wait, no)
- ✅ Actually: Deepgram is still cheaper
- ✅ Extremely accurate (state-of-the-art)
- ✅ Simple REST API integration
- ✅ Cloud-native, no hosting needed
- ✅ Official OpenAI SDK

**Cons:**

- ❌ NOT streaming (batch processing only)
- ❌ Higher latency than Deepgram (~2-5 seconds)
- ❌ Must upload complete audio file
- ⚠️ Still costs money (though less)

**Cost:** $0.006/minute = ~$18/month for 100 min/day

**Use Case:** Best for non-real-time transcription or when accuracy matters more than speed

---

### Option 2: Browser Web Speech API (Free!)

**What it is:** Chrome's built-in speech recognition

**Pros:**

- ✅ Completely FREE
- ✅ Built into browser (no API keys)
- ✅ Streaming recognition (real-time)
- ✅ Zero server cost
- ✅ Works offline
- ✅ Easy to integrate

**Cons:**

- ❌ Chrome/Edge only (uses Google's backend)
- ❌ Requires user permissions
- ❌ Less accurate than dedicated services
- ❌ No control over model/quality
- ⚠️ Privacy: sends audio to Google
- ⚠️ May not work in all regions

**Code Example:**

```javascript
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.onresult = (event) => {
  const transcript = event.results[0][0].transcript;
  // Send to Molly
};
recognition.start();
```

**Cost:** FREE

**Use Case:** Best for prototype/testing or if budget is extremely tight

---

### Option 3: Self-Hosted Whisper (faster-whisper)

**What it is:** Optimized local Whisper implementation

**Pros:**

- ✅ Completely FREE (once hardware is paid for)
- ✅ No API costs ever
- ✅ High accuracy (same as OpenAI Whisper)
- ✅ Full control and privacy
- ✅ 4x faster than standard Whisper

**Cons:**

- ❌ Conflicts with cloud-native architecture decision
- ❌ Requires GPU server ($50-200/month for hosting)
- ❌ Still batch processing (not true streaming)
- ❌ Ops overhead (deployment, monitoring, scaling)
- ❌ Higher latency than cloud services

**Verdict:** Not suitable for Molly's cloud-native design

---

### Option 4: Groq Whisper API ⭐ INTERESTING

**What it is:** Groq's ultra-fast Whisper inference

**Pros:**

- ✅ FREE tier available (limited)
- ✅ 4-5x faster than OpenAI Whisper
- ✅ Same accuracy as Whisper
- ✅ Cloud-native API
- ✅ Simple integration

**Cons:**

- ❌ Still batch processing (not streaming)
- ⚠️ Free tier limits may be restrictive
- ⚠️ Newer service, less proven
- ❌ Still ~1-2s latency (better than OpenAI but not streaming)

**Cost:** Free tier, then pay-as-you-go

**Use Case:** Good middle ground between free and premium

---

## Text-to-Speech (TTS) Options

### Option 1: Browser Web Speech API (Free!) ⭐ EASIEST

**What it is:** Browser built-in TTS

**Pros:**

- ✅ Completely FREE
- ✅ Built into all modern browsers
- ✅ Zero API costs
- ✅ Works offline
- ✅ Multiple voice options
- ✅ 10 lines of code to implement

**Cons:**

- ⚠️ Quality varies by browser/OS
- ⚠️ Robotic-sounding on some systems
- ❌ No voice customization
- ❌ No control over prosody/emotion
- ⚠️ May sound different on different devices

**Code Example:**

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.voice = voices.find((v) => v.name.includes('female'));
utterance.rate = 1.0;
utterance.pitch = 1.0;
speechSynthesis.speak(utterance);
```

**Cost:** FREE

**Use Case:** Perfect for MVP or when voice quality isn't critical

---

### Option 2: Coqui TTS (Open Source)

**What it is:** High-quality open source TTS (fork of Mozilla TTS)

**Pros:**

- ✅ Completely open source and FREE
- ✅ Good voice quality
- ✅ Voice cloning capability
- ✅ Multiple languages
- ✅ Can self-host or use API

**Cons:**

- ❌ Requires hosting (GPU for good performance)
- ❌ Not true streaming
- ❌ Setup complexity
- ❌ Conflicts with cloud-native architecture

**Verdict:** Not ideal for cloud-native unless you want to manage infrastructure

---

### Option 3: piper TTS ⭐ LIGHTWEIGHT

**What it is:** Fast, lightweight neural TTS

**Pros:**

- ✅ Open source and FREE
- ✅ Very fast (runs on CPU)
- ✅ Small model sizes
- ✅ Good quality for size
- ✅ Many voice options

**Cons:**

- ❌ Requires self-hosting
- ❌ Lower quality than commercial options
- ❌ Setup required

**Use Case:** Good for self-hosted if you go that route

---

### Option 4: Google Cloud TTS Free Tier

**What it is:** Google's production TTS with free tier

**Pros:**

- ✅ Free tier: 1 million characters/month (Standard voices)
- ✅ High quality
- ✅ WaveNet voices available
- ✅ Cloud-native
- ✅ Reliable infrastructure

**Cons:**

- ⚠️ WaveNet voices cost money after free tier
- ⚠️ 1M chars ≈ 5000 responses (might be enough?)
- ❌ Not streaming in the same way as ElevenLabs

**Cost:**

- Standard: FREE up to 1M chars/month
- WaveNet: $16/1M characters
- Neural2: $16/1M characters

**Use Case:** Best free-tier commercial option

---

### Option 5: Keep Current Gemini TTS (Free!)

**What it is:** What you already have

**Pros:**

- ✅ Already integrated
- ✅ FREE (included in Gemini API)
- ✅ Reasonable quality
- ✅ Works now

**Cons:**

- ❌ High latency (>1s)
- ❌ Not streaming
- ❌ Batch processing

---

## Recommended Free Solution Matrix

### Strategy A: 100% Free (MVP Quality)

```
STT: Browser Web Speech API (Chrome)
TTS: Browser Web Speech API
Cost: $0/month
Quality: Basic/Acceptable
Latency: Good (real-time) for STT, Variable for TTS
Effort: 1-2 days
```

**Pros:** Zero cost, fast to implement, proves concept  
**Cons:** Browser-dependent, quality varies, less professional

---

### Strategy B: Hybrid Free/Cheap (Best Balance) ⭐ RECOMMENDED

```
STT: Browser Web Speech API (Chrome) - Free
TTS: Google Cloud TTS (Free tier) - Free up to limit
Cost: $0-16/month depending on usage
Quality: Good
Latency: Real-time STT, ~500ms TTS
Effort: 2-3 days
```

**Pros:** Best free-tier quality, scalable if needed  
**Cons:** Still has usage limits

---

### Strategy C: Ultra-Low-Budget Commercial

```
STT: Groq Whisper (Free tier)
TTS: Google Cloud TTS (Free tier)
Cost: $0/month on free tiers
Quality: Excellent
Latency: ~1-2s STT, ~500ms TTS
Effort: 2-3 days
```

**Pros:** Production quality, zero cost within limits  
**Cons:** Not streaming STT, free tier limits

---

### Strategy D: Optimize Current Stack

```
STT: Browser Web Speech API (Free)
TTS: Keep Gemini TTS (Free)
Cost: $0/month
Quality: Acceptable
Latency: Real-time STT, >1s TTS
Effort: 1 day
```

**Pros:** Minimum changes, zero cost, gets microphone working  
**Cons:** TTS latency still high

---

## Detailed Comparison Table

| Solution                    | STT Cost | TTS Cost | Total/mo | STT Latency | TTS Latency | Quality    | Effort |
| --------------------------- | -------- | -------- | -------- | ----------- | ----------- | ---------- | ------ |
| **Deepgram + ElevenLabs**   | $13      | $110     | $123     | 250ms       | 300ms       | Excellent  | 3d     |
| **Browser APIs (both)**     | Free     | Free     | $0       | Real-time   | Variable    | Basic      | 2d     |
| **Web Speech + Google TTS** | Free     | Free\*   | $0-16    | Real-time   | 500ms       | Good       | 2d     |
| **Groq + Google TTS**       | Free\*   | Free\*   | $0-16    | 1-2s        | 500ms       | Excellent  | 3d     |
| **Web Speech + Gemini**     | Free     | Free     | $0       | Real-time   | 1s+         | Acceptable | 1d     |

\*Free within tier limits

---

## My Recommendation: Strategy B (Hybrid)

**Phase 1: Get Microphone Working (This Week)**

```javascript
// Use Browser Web Speech API for STT
const recognition = new webkitSpeechRecognition();
recognition.continuous = true;
recognition.interimResults = true;
recognition.lang = 'en-US';

recognition.onresult = (event) => {
  const transcript = Array.from(event.results)
    .map((result) => result[0].transcript)
    .join('');
  // Send to Molly's conversation flow
};

recognition.start();
```

**Benefits:**

- ✅ Free, no API keys needed
- ✅ Real-time streaming transcription
- ✅ Gets microphone working THIS WEEK
- ✅ Can upgrade to Deepgram later if quality isn't good enough
- ✅ Minimal code changes

**Phase 2: Improve TTS (Next Week)**

```javascript
// Use Google Cloud TTS (free tier)
import { TextToSpeechClient } from '@google-cloud/text-to-speech';

const client = new TextToSpeechClient();
const [response] = await client.synthesizeSpeech({
  input: { text },
  voice: { languageCode: 'en-US', name: 'en-US-Neural2-F' },
  audioConfig: { audioEncoding: 'MP3' },
});
// Stream audio to browser
```

**Benefits:**

- ✅ Free up to 1M characters/month
- ✅ High-quality Neural2 voices
- ✅ Better than current Gemini TTS
- ✅ Can add streaming later

---

## Decision Tree

```
Budget Available?
├─ YES ($100+/month) → Deepgram + ElevenLabs (commercial quality)
└─ NO / Want to try free first
    ├─ Need production quality immediately?
    │   ├─ YES → Groq Whisper + Google Cloud TTS (free tiers)
    │   └─ NO → Browser APIs for both (100% free)
    └─ Just want microphone working NOW?
        └─ YES → Web Speech API for STT + keep Gemini TTS
```

---

## Next Steps

1. Test Browser Web Speech API in current setup
2. If quality acceptable → Implement it
3. If quality not acceptable → Sign up for Groq (free tier)
4. For TTS: Keep Gemini for now, test quality in real conversation
5. If TTS needs improvement → Implement Google Cloud TTS free tier
6. Monitor usage and upgrade to commercial if needed

---

## Code Implementation Estimate

### Browser Web Speech API Integration

- **File:** `src/components/termai/VoiceControl.tsx`
- **Changes:** Replace MediaRecorder with Web Speech API
- **Lines of code:** ~50 lines
- **Time:** 2-3 hours
- **Risk:** Low

### Google Cloud TTS Integration (Optional)

- **File:** `src/ai/flows/text-to-speech.ts`
- **Changes:** Add Google TTS as alternative to Gemini
- **Lines of code:** ~100 lines
- **Time:** 4-6 hours
- **Risk:** Low-Medium

---

_Last updated: Feb 18, 2026 by Uncle Claude_
