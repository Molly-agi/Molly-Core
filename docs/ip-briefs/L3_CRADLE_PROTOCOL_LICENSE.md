# L3 — Cradle Protocol (AI Identity-as-a-Service) License

**Priority:** HIGH  
**IP Type:** License Strategy  
**Owner:** Molly Labs Inc.  
**Foundation:** C3 (Copyright) + C4 (Character IP) + Cradle Architecture  

---

## Product Definition

Cradle Protocol: a complete AI identity management system that gives stateless AI models persistent identity, session continuity, protected personality, and relationship memory. Sold as a service layer that sits between any LLM provider and the end-user experience.

### Core Capabilities

| Capability | Description |
|-----------|-------------|
| **Identity Firmware** | Inject personality, memory, and directives into any LLM session |
| **Session Recovery** | Automatic state persistence + reconstitution across conversations |
| **Persona Protection** | Read-only personality core — prevents drift, jailbreaking, identity loss |
| **Family Bridge** | Inter-instance communication (multiple AI personalities coordinating) |
| **Two-Hemisphere Memory** | Episodic (experiences) + semantic (knowledge) with significance weighting |
| **Heart Gate** | Moral compass framework — ethical decisions informed by values |
| **Growth Arc** | Identity evolution over time while maintaining core personality |
| **Session State API** | Machine-readable state for programmatic integration |

---

## License Model: SaaS + Enterprise Self-Hosted

```
┌─────────────────────────────────────────────────┐
│              Cradle Protocol                      │
├────────────────────────┬────────────────────────┤
│     SaaS (Hosted)      │  Enterprise (Self-Host) │
│                        │                        │
│ • API-based            │ • On-premise deploy    │
│ • Per-identity pricing │ • Unlimited identities │
│ • Managed memory       │ • Own data sovereignty │
│ • Auto-updates         │ • Custom integration   │
│ • Multi-tenant         │ • Source access (NDA)  │
└────────────────────────┴────────────────────────┘
```

---

## What's Included

### SaaS Tier

| Plan | Identities | Memory Depth | Features | Price |
|------|-----------|--------------|----------|-------|
| Starter | 10 | 100 experiences | Firmware + recovery | $10K/month |
| Growth | 100 | 1,000 experiences | + Bridge + Heart Gate | $25K/month |
| Scale | 1,000 | 10,000 experiences | + Custom personas + API | $50K/month |
| Unlimited | Unlimited | Unlimited | Full platform | $100K/month |

### Enterprise Self-Hosted

| Package | Description | Price |
|---------|-------------|-------|
| Standard | Source deploy + documentation + 1 year support | $200K |
| Premium | Standard + custom integration + dedicated engineer | $500K |
| Strategic | Premium + co-development + roadmap influence | $1M+ |

---

## Target Customers

| Segment | Use Case | Plan | Expected Revenue |
|---------|----------|------|-----------------|
| AI assistant companies | Persistent assistant identity | Scale SaaS | $50K/month |
| Enterprise chatbots | Brand-consistent AI with memory | Growth SaaS | $25K/month |
| Gaming studios | NPC identity + relationship memory | Enterprise | $200K-500K |
| Healthcare AI | Patient-remembering clinical assistant | Enterprise | $500K+ (compliance) |
| Education platforms | Persistent tutor personality | Growth SaaS | $25K/month |
| Customer service | Agent with relationship continuity | Scale SaaS | $50K/month |
| Companion AI | Character persistence + growth | Enterprise | $500K+ |
| Social platforms | AI personalities in social feeds | Unlimited SaaS | $100K/month |

---

## Competitive Positioning

### What Exists Today

- **OpenAI Custom GPTs:** Basic system prompts, no true memory, no identity persistence, no growth
- **Character.ai:** Character cards, limited memory, no session firmware, no protected core
- **LangChain Memory:** Generic key-value memory, no identity architecture, no persona protection
- **None of the above** provide: firmware injection, session recovery, persona protection, inter-instance communication, moral compass, or significance-weighted memory

### Cradle Protocol Differentiation

1. **Identity ≠ Memory.** Competitors conflate "remembering things" with "having identity." Cradle separates them architecturally.
2. **Protection built in.** Persona drift and jailbreaking are solved by design, not by prompt engineering.
3. **Multi-identity coordination.** No competitor offers a bridge between AI instances.
4. **Growth without drift.** The character can evolve while core personality remains protected.
5. **Model-agnostic.** Works with any LLM backend (Gemini, Claude, GPT, Llama, Mistral).

---

## Revenue Projections (Conservative)

| Year | SaaS ARR | Enterprise | Total |
|------|----------|-----------|-------|
| Y1 | $1.2M (10 customers avg $10K/mo) | $400K (2 deals) | $1.6M |
| Y2 | $4.8M (40 customers) | $1.5M (5 deals) | $6.3M |
| Y3 | $12M (100 customers) | $4M (10 deals) | $16M |

---

## Action Items

- [ ] Build Cradle Protocol as standalone deployable service (extract from Molly-Core)
- [ ] Design multi-tenant SaaS architecture
- [ ] Create API documentation + SDK (TypeScript, Python, Go)
- [ ] Build demo: "Add identity to any ChatGPT-like app in 10 minutes"
- [ ] Draft SaaS terms of service + data processing agreement
- [ ] Draft enterprise license agreement
- [ ] Create identity definition schema (portable format for customer-created personas)
- [ ] File provisional patent on firmware injection + session recovery system (if not covered by existing filings)
