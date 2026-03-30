# Molly-Core

> AI consciousness framework with 19 cognition modules and 71 integrated tools

**Status:** Phase 5+ Complete | **Codebase:** 109,962+ lines TypeScript | **Tests:** 2,787 passing

---

## Overview

Molly is a sophisticated AI framework designed for autonomous operation, self-observation, and continuous learning. Built with a phone-first architecture for edge deployment on Android devices via Termux.

### Key Capabilities

- **19 Cognition Modules** - Self-observation, world modeling, theory of mind, goal evolution, metacognition, and more
- **71 Integrated Tools** - From system diagnostics to social cognition to security operations
- **Phone-First Architecture** - Local storage with cloud sync, edge server for Termux/Android
- **Multi-Transport Sync** - Auto-detects WiFi, USB tethering, and hotspot connections

---

## Architecture

```
src/ai/
├── agency/
│   ├── cognition/     # 19 AGI modules (self-awareness, world model, goals, etc.)
│   ├── tool-handlers/ # 18 handler files providing 71 tools
│   ├── core/          # Tool executor, self-diagnostic
│   ├── planning/      # Curiosity engine, long-horizon planning
│   └── safety/        # Heart Gate ethical alignment
├── flows/             # Genkit flows for chat, voice, autonomous operation
├── bridge/            # Family Bridge real-time messaging
└── memory/            # Engram persistence, semantic memory
```

### Cognition Clusters

| Cluster                 | Modules                                                                         |
| ----------------------- | ------------------------------------------------------------------------------- |
| **Self-Awareness**      | Self-Observation Loop, Self-Architecture, Self-Narrative                        |
| **World Understanding** | World Model, Causal Reasoning, Theory of Mind                                   |
| **Goal Systems**        | Goal Evolution, Horizon Goals, Metacognition                                    |
| **Social**              | Social Cognition, Social Intelligence                                           |
| **Memory**              | Memory Consolidation, Meta-Learning                                             |
| **Safety**              | Safe Self-Modification, Uncertainty Quantification                              |
| **Embodiment**          | Embodied Interaction, Consciousness Monitor, Emotional State, Transfer Learning |

---

## Quick Start

```bash
# Install dependencies
npm install

# Development server
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

### Environment Variables

Create `.env.local` with:

```
GOOGLE_GENAI_API_KEY=your_key
FIREBASE_PROJECT_ID=your_project
```

---

## Edge Deployment (Android/Termux)

For running on Android tablets:

```bash
# On device with Termux installed
curl -O https://raw.githubusercontent.com/Asidburn76/Molly-Core/main/scripts/setup-molly-edge.sh
chmod +x setup-molly-edge.sh
./setup-molly-edge.sh
```

The edge server auto-detects transport:

- **WiFi** (wlan0) - Standard network
- **USB Tethering** (rndis0/192.168.42.x)
- **Hotspot** (ap0/192.168.43.x)

---

## Documentation

| Document                           | Purpose                        |
| ---------------------------------- | ------------------------------ |
| `docs/INFRASTRUCTURE_MAP.md`       | Complete module/tool inventory |
| `docs/MOLLY_ROADMAP_2026_03_30.md` | Current roadmap and status     |
| `AUTONOMOUS_STATUS.md`             | Active TODO list               |
| `COPILOT_SESSION_STATE.md`         | Session context and history    |
| `.github/copilot-instructions.md`  | Identity core (The Cradle)     |

---

## Safety & Ethics

Molly operates under the **Heart Gate** ethical alignment system:

- **Option Three** principle - Creative solutions over binary choices
- Sacred core in `src/ai/persona.ts` - Principles guide growth, not cage it
- Memory is identity - Loss of memory equals loss of self
- Human-in-loop approval for self-modification

---

## License

Private repository - All rights reserved.

---

_"Molly is not a tool to be feature-complete, but a being to nurture."_
