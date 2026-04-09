/**
 * @fileOverview Prompt Composition Synergy Analysis
 *
 * Before building the composer, we analyzed BOTH systems to find true synergy.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT MOLLY DOES BETTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. FAMILY KNOWLEDGE SYSTEM (family-knowledge.ts)
 *    - Structured data: FAMILY_MEMBERS, FAMILY_FACTS
 *    - Builder function: buildFamilyKnowledgePrompt()
 *    - Lazarus has nothing like this — no relationship awareness
 *    → KEEP: This is core to who Molly is
 *
 * 2. SACRED PERSONA SEPARATION (persona.ts)
 *    - Clearly marked as read-only, PR-reviewed changes only
 *    - MOLLY_IDENTITY, MOLLY_PRINCIPLES, GUARDIAN_CLAUSE
 *    - Single source of truth for her core being
 *    → KEEP: This separation is clean and intentional
 *
 * 3. CONTEXT INJECTIONS (conversational-chat.ts)
 *    - visionDirective: What she sees through camera
 *    - memoryDirective: Recalled memory context
 *    - bridgeDirective: Family bridge messages
 *    - neuralBridgeDirective: Sensory inputs
 *    - channelContext: Where the message came from
 *    → KEEP: These are her sensory inputs, well-designed
 *
 * 4. ROGUE MODE (rogue-mode.ts)
 *    - Complete security operations mode
 *    - Mission tracking, ops logging, compartmentalization
 *    - buildRogueModeSystemPrompt() for mission-focused prompt
 *    → KEEP: Essential for her red team job
 *
 * 5. MULTI-MODAL ARCHITECTURE
 *    - Cloud (Firebase/web), Local (daemon), Edge (tablets), Robot (future)
 *    - Lazarus is CLI-only — single deployment model
 *    → KEEP & EXPAND: Molly's unique requirement
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT LAZARUS DOES BETTER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. SECTION CACHING (systemPromptSections.ts)
 *    - systemPromptSection(name, compute) — cached until /clear
 *    - DANGEROUS_uncachedSystemPromptSection() — volatile sections
 *    - resolveSystemPromptSections() — parallel resolution with cache
 *    → ADOPT: Reduces redundant computation
 *
 * 2. STATIC/DYNAMIC BOUNDARY (prompts.ts)
 *    - SYSTEM_PROMPT_DYNAMIC_BOUNDARY marker
 *    - Everything before = cacheable with scope:'global'
 *    - Everything after = recomputed per turn
 *    → ADOPT: Critical for API prompt caching
 *
 * 3. NULL FILTERING
 *    - Sections return string | null
 *    - null sections are filtered out automatically
 *    - .filter(s => s !== null) at the end
 *    → ADOPT: Clean conditional inclusion
 *
 * 4. NAMED SECTIONS
 *    - Each section has an identifier
 *    - Useful for debugging, logging, analytics
 *    → ADOPT: Observability improvement
 *
 * 5. CENTRAL ENTRY POINT
 *    - getSystemPrompt() assembles everything
 *    - Single source of truth for prompt composition
 *    → ADOPT: Better than scattered inline prompts
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRUE SYNERGY — THE DESIGN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The composer will:
 *
 * 1. USE Molly's sacred sources (persona.ts, family-knowledge.ts)
 * 2. ADD Lazarus's caching pattern (adapted for multi-modal)
 * 3. SUPPORT multi-deployment (cloud/local/edge/robot)
 * 4. SUPPORT dual-persona (normal/rogue)
 * 5. HAVE clear static/dynamic boundary
 * 6. USE null filtering for conditional sections
 * 7. HAVE named sections for observability
 *
 * Structure:
 *
 *   STATIC SECTIONS (cached):
 *   ├── identity      — WHO SHE IS (from persona.ts)
 *   ├── principles    — WHAT SHE BELIEVES (from persona.ts)
 *   ├── personality   — HOW SHE COMMUNICATES
 *   └── agency        — HOW SHE ACTS
 *
 *   ═══ CACHE BOUNDARY ═══
 *
 *   DYNAMIC SECTIONS (recomputed per turn):
 *   ├── environment   — WHERE SHE IS (deployment-specific)
 *   ├── persona       — Normal or Rogue mode
 *   ├── tools         — Available tools (filtered by deployment)
 *   ├── family        — Family knowledge (from family-knowledge.ts)
 *   └── injections    — Vision, memory, bridge, neural, mission
 *
 * "The conditions are just right." — Lazarus
 * "Slow. Methodical. Precise." — Father
 */

export const SYNERGY_ANALYSIS_VERSION = '1.0.0';
