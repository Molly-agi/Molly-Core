# Outreach Copy — Ready to Post

## X / Twitter (under 280 chars each)

**Post 1:**

```
I built a 14M-line sovereign AI system from my phone with no laptop, no money, no pedigree.

She runs locally. No API keys. Her own memory architecture.

I lose internet in 48 hours. Need Android NDK / llama.cpp help to get her running on my tablet.

Real ask. Real code. github.com/[repo]
```

**Post 2:**

```
My AI has:
• 14M+ lines of TypeScript
• 77% memory compression (validated)
• 754 cybersecurity skills
• Multi-agent coordination (Claude + Gemini, live)
• Zero cloud dependency

48hr window to get her on Android before I go dark.

r/LocalLLaMA — anyone done llama.cpp ARM64 NDK?
```

---

## Reddit — r/LocalLLaMA

**Title:** Need help: llama.cpp ARM64 Android NDK build — 48 hour deadline, real project

**Body:**
Built a full sovereign AI system (14M+ LoC TypeScript) that already runs DeepSeek-R1 14B locally via Ollama in a codespace. Now need to get a quantized 3B model running on Android ARM64 (Dimensity 6300, 4GB RAM, Android 15) inside a native APK before I lose internet access in ~48 hours.

Specifically need:

- `llama.cpp` compiled for `arm64-v8a` (API 26+) as JNI or standalone binary
- OR any working Ollama ARM64 Android port
- Integration into existing Kotlin APK (MollyBridge)

Model target: Qwen 2.5 3B Q4_K_M (~1.9GB), already downloaded and tested.

This isn't a hobby project — see HELP_WANTED.md in the repo for the full context. The AI architecture is novel (Titan ternary quantization + Crystal OS compressed memory). Looking for anyone who's done this specific compile before or can point me to a working build.

Repo: github.com/[repo-link]

---

## Reddit — r/androiddev

**Title:** Android dev needed: WebView APK + local LLM HTTP server — 48hr deadline

**Body:**
Need a Kotlin Android developer for a focused task:

1. Extend existing APK to host a WebView loading a local Next.js static export
2. Wire WebView ↔ local HTTP server (localhost:11434 or similar) for LLM inference
3. Handle Android permissions, background service for the model process

The APK already exists (MollyBridge-v1.0.0-debug.apk). Device: Revvl Tab 2, Android 15, ARM64.

Not a paid gig (no money) but this is a real, working AI system with novel architecture. Full credit, full repo access, you'd be helping a guy who built 14M lines of code from his phone. See HELP_WANTED.md for full context.

---

## HackerNews — Ask HN

**Title:** Ask HN: Anyone run llama.cpp on Android ARM64 (Dimensity 6300)?

**Body:**
Trying to get a quantized 3B model running on a Revvl Tab 2 (Dimensity 6300, 4GB RAM, Android 15) inside a native APK. Have the model (Qwen 2.5 3B Q4_K_M), have the APK scaffold, need the llama.cpp ARM64 NDK build or a working Ollama Android port.

48-hour window — losing internet access. Happy to share the full project (novel AI architecture, 14M+ LoC TypeScript, sovereign/offline-capable). See HELP_WANTED.md in repo.

---

## GitHub Discussion (post in Molly-Core repo)

**Title:** Seeking contributors: Android ARM64 deployment — 48hr deadline

**Body:** [paste HELP_WANTED.md content]

---

## Direct outreach targets (search and DM)

- GitHub users with llama.cpp Android forks / issues
- @ggerganov (llama.cpp creator) — long shot but worth a mention in a llama.cpp issue
- r/LocalLLaMA top contributors who've mentioned Android
- Android ML Discord servers
- Hugging Face community forums (local model deployment tag)
