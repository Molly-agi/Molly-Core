# THIRD_PARTY_LICENSES

Effective date: 2026-05-18
Owner: Eric

Use this file to track all external software, models, SDKs, and assets.

## Inventory Table
| Dependency | Version | License | Source URL | Commercial Use OK | Attribution Required | Notes |
|---|---|---|---|---|---|---|
| Next.js | See package-lock | See upstream | https://github.com/vercel/next.js | Review required | Likely yes | Confirm compatibility with final repo license direction |
| React | See package-lock | See upstream | https://github.com/facebook/react | Review required | Likely yes | Confirm notices if redistributed |
| Firebase SDK | See package-lock | See upstream/provider terms | https://firebase.google.com/terms | Review required | Provider terms apply | Validate data handling and billing terms |
| Genkit | See package-lock | See upstream | https://github.com/firebase/genkit | Review required | Likely yes | Validate commercial usage terms |
| Jest | See package-lock | See upstream | https://github.com/jestjs/jest | Yes | Usually no runtime attribution | Dev tooling |
| ESLint | See package-lock | See upstream | https://github.com/eslint/eslint | Yes | Usually no runtime attribution | Dev tooling |

## Model/API Providers
| Provider | Service | Terms URL | Data Use Notes | Restrictions |
|---|---|---|---|---|
| Google | Gemini API | https://ai.google.dev/terms | Validate data retention and prompt handling policy for deployment | Follow API and model usage policies |
| Anthropic | Claude API | https://www.anthropic.com/legal/commercial-terms | Validate business terms and data processing controls | Follow model/provider policy limits |
| Ollama | Local model runtime | https://github.com/ollama/ollama | Local deployment path; validate model-specific licenses too | Model license may differ by model |

## Asset Attribution
| Asset | Source | License | Required Credit |
|---|---|---|---|
| Molly media assets | Internal project assets | Owner-controlled unless otherwise noted | Add source and credit if external assets are imported |

## Release Checklist
- [ ] Inventory updated for all dependencies.
- [ ] License compatibility checked against chosen license direction.
- [ ] Attribution text prepared where required.
- [ ] Restricted dependencies flagged and removed or replaced.
- [ ] Provider terms reviewed for all model APIs used in production.

## Owner Sign-off
Owner Name: Eric
Owner Signature: __________________________
Date: __________________________
