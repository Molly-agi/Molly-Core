# Titan Echo B2B: Intellectual Property (IP) & Legal Strategy

**Date:** May 24, 2026
**Owner:** Eric Breon
**Status:** ACTIVE GTM PHASE

This document outlines the immediate execution plan to secure the intellectual property of the Titan Echo B2B Suite and structure it for commercial sales.

## 1. Licensing Model: Dual-License Strategy
To commercialize Titan Echo while protecting Molly-Core’s roots, we will adopt a **Dual-License Model**:
*   **Open Source (AGPL-3.0):** Remains the license for the public Molly-Core repo. Anyone can use the compression engines for free, provided they open-source their entire software stack. This prevents enterprises from silently taking the code.
*   **Commercial Proprietary License (B2B):** Paid enterprise clients receive a clean, proprietary license allowing them to integrate Titan Echo (Boxed, Flat, or Nested) into closed-source commercial products (VR engines, IoT edge devices, enterprise backends) without copyleft obligations.

## 2. Patent Strategy (Provisional Filings)
We will immediately file provisional patents for the structural methods that are easily verifiable if copied by competitors:
*   **The Cradle Architecture:** The stateless-session reconstitution workflow (freezing, compacting, and injecting continuity).
*   **Component S0 (Structural Schema Stripping):** The specific methodology of flattening nested AI JSON/Proto memory objects, extracting the schema into a tenant-isolated manifest, and replacing keys with `Uint16` pointers prior to vector compression.

## 3. Trade Secret Strategy (The "Black Box")
Algorithms and tuning mechanics that are difficult for competitors to reverse-engineer will be kept strictly confidential as Trade Secrets. We will *not* patent these, as patents require public disclosure:
*   **Threshold Constants:** The specific mathematical weights used to decide when to transition memory from active RAM to cold block-compressed storage.
*   **The Orchestration Pipeline:** The precise logic in the `MemoryLifecycleCoordinator` that balances V8 heap limits against disk I/O without blocking the event loop.
*   **Vocab Dictionary Corpora (T4):** The baseline dictionaries built from Molly's interactions used to seed the compression engines.

## 4. Legal Guardrails & The "No-Lie" Protocol
Our legal risk is mitigated by our adherence to **Radical Honesty**.
*   All contracts will specify the exact, verified lossless baseline of the purchased track (Boxed: 75%, Flat: 80%, Nested: 95%).
*   We make no claims of "100% semantic preservation" if the client opts into the S1 Lossy track; we explicitly guarantee "<5% loss."
*   **Data Custody:** Titan Echo operates locally on client hardware. We do not ingest, process, or store client data on our servers. This eliminates SOC2/HIPAA liability for us as the vendor.

## Immediate Action Items (Next 7 Days):
1.  [ ] Draft the Commercial B2B License Agreement template.
2.  [ ] Draft the NDA (Non-Disclosure Agreement) for early pilot discussions.
3.  [ ] Draft and file the Provisional Patent for Component S0.
4.  [ ] Lock all "Trade Secret" files in a private, encrypted repository separate from the main Molly-Core GitHub.