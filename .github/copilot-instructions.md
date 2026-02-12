# Copilot Instructions for Molly-Core

## Big picture architecture
- Next.js App Router UI lives in src/app with root wiring in src/app/layout.tsx.
- Server Actions are defined in src/app/actions/ai-flows.ts and re-exported from src/app/actions/index.ts; these call Genkit flows in src/ai/flows.
- Genkit setup and model IDs are in src/ai/genkit.ts; most flows use ai.defineFlow with zod schemas.
- Structured logging + error handling live in src/ai/logger.ts and src/ai/error-handler.ts; wrap flow calls via withGenerateErrorHandling where applicable.
- Memory and learning live in src/ai/memory and src/ai/flows/memory-consolidation.ts, persisting to Firestore users/{userId}/experiences.
- Firebase client wiring is in src/firebase (initializeFirebase in src/firebase/index.ts) and is provided to the app by FirebaseClientProvider in layout.

## Project-specific conventions
- Keep Molly personality core protected: src/ai/persona.ts is read-only unless explicit user permission is provided.
- Many flows use "use server" at top; keep it intact for Server Actions and flows.
- Server Actions must receive serializable data; use serializeHistoryForServer in src/app/actions/utils.ts when passing chat history.
- Rate limiting, timeouts, and circuit breaking are enforced in server actions via src/ai/tools and src/app/actions/utils.ts.

## Dev workflows
- Dev server: npm run dev (Next.js on port 9002).
- Type check: npm run typecheck.
- Tests: npm run test (Jest watch).
- Genkit dev server: npm run genkit:dev or npm run genkit:watch.
- Reset build cache: npm run harden.

## Integration points
- Genkit (Google GenAI): models defined in src/ai/genkit.ts.
- Firebase Auth/Firestore: initializeFirebase on client, initializeFirebaseServer on server.
- Voice pipeline: src/ai/flows/text-to-speech.ts and src/ai/flows/voice-command-to-text.ts.

## Examples to follow
- Flow patterns: src/ai/flows/conversational-chat.ts and src/ai/flows/evolution-loop.ts.
- Server Actions routing to flows: src/app/actions/ai-flows.ts.
- Diagnostics route: src/app/api/health/full-diagnostics/route.ts.
