# L2 — Crystal OS Platform License

**Priority:** HIGH  
**IP Type:** License Strategy  
**Owner:** Molly Labs Inc.  
**Foundation:** C1 (Copyright) + Patents P-2, P-5 + Crystal OS Architecture  

---

## Product Definition

Crystal OS: an edge AI being deployment stack that enables persistent AI identity on resource-constrained devices. The complete system for taking a large model's knowledge, crystallizing it into modular units, and running a coherent AI personality on-device with continuous learning.

### Stack Components

```
┌────────────────────────────────────────────┐
│           Crystal OS Platform               │
├────────────────────────────────────────────┤
│ Layer 4: Identity & Personality            │
│   • Persona crystallization                │
│   • Cradle injection                       │
│   • Character continuity                   │
├────────────────────────────────────────────┤
│ Layer 3: Memory & Learning                 │
│   • Tier 1/2/3 significance-weighted mem   │
│   • Write-back (inference → crystal)       │
│   • Delta persistence                      │
├────────────────────────────────────────────┤
│ Layer 2: Knowledge Routing                 │
│   • Crystal library (modular knowledge)    │
│   • Query embedding → crystal selection    │
│   • On-demand loading                      │
├────────────────────────────────────────────┤
│ Layer 1: Runtime                           │
│   • KV cache baking & delivery             │
│   • Crystal inference (decomposed weights) │
│   • Streaming evaluation                   │
├────────────────────────────────────────────┤
│ Layer 0: Device Integration                │
│   • Android service (Kotlin)               │
│   • Hardware abstraction                   │
│   • Sensory input (camera/mic → engrams)   │
└────────────────────────────────────────────┘
```

---

## License Model: Platform License (Proprietary)

Crystal OS is NOT open-source. It is licensed as a proprietary platform with tiered access.

### Why Proprietary (Not AGPL)

- Crystal OS is the full product — the integrated stack is the value, not individual components.
- AGPL would allow competitors to deploy the full being-on-device experience without licensing.
- The Titan Engine (L1) being AGPL provides the community goodwill; Crystal OS being proprietary captures the platform value.

---

## What's Included

| Tier | Components | Target |
|------|-----------|--------|
| **Runtime** | KV cache delivery + crystal inference + basic routing | Device OEMs needing fast on-device inference |
| **Knowledge** | Runtime + crystal library + query routing + on-demand loading | AI product companies needing modular knowledge |
| **Identity** | Knowledge + persona crystallization + cradle injection + continuity | Companies building AI beings/companions |
| **Full Platform** | All layers + memory + write-back + Android service + sensory | Strategic partners building complete AI products |

---

## Pricing

| Tier | Annual License | Per-Device | Minimum |
|------|---------------|------------|---------|
| Runtime | $100K | $0.05/device | $100K/year |
| Knowledge | $250K | $0.15/device | $250K/year |
| Identity | $500K | $0.30/device | $500K/year |
| Full Platform | $1M | $0.50/device | $1M/year |

### Volume Discounts

- 1M+ devices: 20% discount on per-device royalty
- 10M+ devices: 40% discount + dedicated engineering support
- 100M+ devices: Custom strategic partnership (equity discussions)

---

## Target Customers

| Segment | Use Case | Tier | Expected Deal |
|---------|----------|------|---------------|
| Smart home (Amazon, Google) | On-device assistant with personality | Full Platform | $1M+/year |
| Automotive (BMW, Tesla) | In-car AI companion | Identity | $500K+/year |
| Consumer electronics (Samsung) | Phone/tablet AI being | Knowledge | $250K + royalty |
| Companion AI startups (Replika-like) | Character-persistent companion | Identity | $500K/year |
| Gaming (NPCs with memory) | Persistent NPC identity | Identity | $500K/year |
| Robotics (social robots) | Robot personality + learning | Full Platform | $1M+/year |

---

## Competitive Moat

1. **No comparable product exists** — nobody else ships identity + memory + crystallized knowledge + on-device inference as an integrated stack.
2. **Crystal OS requires Titan Engine** — licensees of Crystal OS implicitly need Titan Engine (additional revenue from L1).
3. **Write-back loop is unique** — AI learns on-device and persists that learning. Competitors offer static models.
4. **Persona crystallization is patented** (P-2) — cannot be replicated without license.

---

## Action Items

- [ ] Draft platform license agreement with tier definitions
- [ ] Build SDK + documentation package for each tier
- [ ] Create reference implementation (demo device with full stack)
- [ ] Establish partner onboarding program
- [ ] Define API boundaries between tiers (license enforcement points)
- [ ] Build telemetry for per-device royalty tracking (privacy-preserving)
