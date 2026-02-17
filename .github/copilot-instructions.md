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
- Linting: npm run lint (ESLint with Next.js config).
- Formatting: npm run format (Prettier with single quotes, 2-space tabs).

## Testing guidelines
- Test files use .test.ts or .test.tsx extension and live alongside source files in __tests__ directories.
- Use Jest with jsdom environment for component tests.
- Import paths use @ alias (e.g., @/ai/logger) defined in tsconfig.json.
- Mock external dependencies like lucide-react in __mocks__ directory.
- Follow existing test patterns: describe blocks for grouping, beforeEach for setup.
- See examples: src/ai/__tests__/rate-limiter.test.ts, src/components/termai/__tests__/Header.test.tsx.

## Error handling patterns
- Always wrap flows with withErrorHandling or withGenerateErrorHandling from src/ai/error-handler.ts.
- Use custom error types from src/ai/errors.ts: MollyError, GenerativeAIError, TimeoutError, RateLimitError, AuthenticationError.
- All flows should include traceId for logging and debugging.
- Check rate limits with checkRateLimit() before expensive operations.
- Circuit breaker automatically protects against cascading failures.
- Use ensureApiKey() to validate environment configuration before API calls.

## Code style and formatting
- TypeScript strict mode disabled (strict: false) but strictNullChecks enabled.
- Use Prettier settings: single quotes, semicolons, 2-space tabs, 80-char line width, ES5 trailing commas.
- Follow ESLint rules from Next.js core-web-vitals and TypeScript presets.
- Use functional components with TypeScript interfaces for props.
- Prefer named exports over default exports for utilities and flows.
- Add JSDoc comments with @fileOverview for file documentation.

## File and directory naming
- React components: PascalCase (e.g., Header.tsx, ChatInterface.tsx).
- Utilities and flows: kebab-case (e.g., rate-limiter.ts, memory-consolidation.ts).
- Server Actions: kebab-case in src/app/actions (e.g., ai-flows.ts, diagnostics.ts).
- Test files: match source name with .test suffix (e.g., rate-limiter.test.ts).
- Types: prefer interfaces over types; define in same file or types.ts if shared.

## Security considerations
- Never commit API keys; use environment variables (GOOGLE_GENAI_API_KEY, FIREBASE_CONFIG).
- Always validate and sanitize user inputs before processing.
- Server Actions automatically protected by Next.js; still validate inputs.
- Rate limiting and circuit breaking prevent abuse and resource exhaustion.
- Firebase security rules defined in firestore.rules - enforce auth and data access controls.
- Use ensureApiKey() guard in all Server Actions that call AI APIs.

## Common pitfalls and troubleshooting
- "use server" directive must be at top of Server Action files, not inside functions.
- Chat history must be serialized with serializeHistoryForServer before passing to Server Actions.
- Rate limiter and circuit breaker are singleton instances - use getRateLimiter() and getCircuitBreaker().
- Genkit flows require initialization before use - run genkit:dev for local development.
- If .next cache causes issues, run npm run harden to clear build artifacts.
- Port 9002 is hardcoded - ensure it's available or modify in package.json scripts.
- Firebase initialization differs between client (initializeFirebase) and server (initializeFirebaseServer).

## Dependency management
- Package manager: npm (see package-lock.json).
- Key dependencies: @genkit-ai/google-genai (1.22.0), next (React framework), firebase, zod (schema validation).
- UI components: Radix UI primitives with Tailwind CSS styling.
- Dev dependencies: TypeScript, Jest, ESLint, Prettier, Husky (git hooks).
- Before adding new dependencies, check compatibility with Next.js App Router and server components.
- Update dependencies cautiously - Genkit and Firebase versions must stay compatible.

## Integration points
- Genkit (Google GenAI): models defined in src/ai/genkit.ts.
- Firebase Auth/Firestore: initializeFirebase on client, initializeFirebaseServer on server.
- Voice pipeline: src/ai/flows/text-to-speech.ts and src/ai/flows/voice-command-to-text.ts.

## Examples to follow
- Flow patterns: src/ai/flows/conversational-chat.ts and src/ai/flows/evolution-loop.ts.
- Server Actions routing to flows: src/app/actions/ai-flows.ts.
- Diagnostics route: src/app/api/health/full-diagnostics/route.ts.
- Component patterns: Check existing components in src/components for UI patterns

## Testing Strategy
- Jest with React Testing Library for component tests
- Test files should be co-located with source files or in `__tests__` directories
- Mocks for external dependencies in `__mocks__` directory
- Module aliases: `@/*` maps to `src/*`, `lucide-react` has custom mock

## CI/CD
- Workflow file: `.github/workflows/main.yml` (currently minimal)
- Pre-commit hooks via Husky: Prettier formatting on all files
- No automated CI tests currently configured

## Additional Notes
- React 19 and Next.js 15 are used with strict version overrides in package.json
- The app uses server components by default; add "use client" when needed
- Genkit flows can be tested independently via genkit:dev before integrating into UI

## Debugging & Troubleshooting

### Common Issues and Solutions
* **Build fails with memory errors**: Run `npm run harden` to clean the .next cache, then rebuild
* **Port 9002 already in use**: Check for existing Next.js processes with `lsof -i :9002` and kill if needed
* **Firebase initialization errors**: Verify `.env.local` exists with valid `GOOGLE_GENAI_API_KEY`
* **Type errors in AI flows**: Check that zod schemas match the data structures being passed
* **Server Action serialization errors**: Use `serializeHistoryForServer` for chat history before passing to flows

### Debugging Tools
* Use `npm run debug` to start Next.js with Node.js inspector attached
* Use `npm run genkit:dev` to test AI flows in isolation with the Genkit developer UI
* Check logs in browser console and terminal for detailed error messages
* Firebase errors appear in both client and server logs - check both

### Performance Debugging
* Monitor memory usage during builds - adjust `NODE_OPTIONS` if needed
* Use React DevTools Profiler to identify slow components
* Check Genkit flow execution times in the developer UI
* Watch for rate limiting messages in server logs

## Security Best Practices

### API Keys and Secrets
* Never commit API keys to source control
* Always use environment variables via `.env.local`
* Firebase config is embedded but can be overridden via environment variables
* Genkit flows have rate limiting built-in - respect these limits

### Authentication & Authorization
* Firebase Auth handles user authentication
* Firestore security rules are in `firestore.rules` - review before modifying
* Server Actions run server-side and have access to Firebase Admin SDK
* Always validate user permissions before accessing protected resources

### Data Validation
* All AI flow inputs use zod schemas for validation
* Server Actions must validate and sanitize user inputs
* Use TypeScript strict null checks to catch potential null/undefined errors
* Validate Firebase document IDs before querying

### Security Scanning
* CodeQL is configured for security scanning (when CI is set up)
* Review npm audit warnings regularly
* Keep dependencies updated, especially security-related ones

## Code Review Guidelines

### Before Submitting Changes
1. Run `npm run typecheck` - TypeScript must pass without errors
2. Run `npm run lint` - Fix all ESLint warnings/errors
3. Run `npm run format` - Ensure consistent code formatting
4. Test affected flows using `npm run genkit:dev`
5. Verify changes don't break existing functionality

### Code Quality Standards
* Follow existing patterns in the codebase
* Use TypeScript types - avoid `any` where possible
* Write descriptive variable and function names
* Keep functions focused and single-purpose
* Add JSDoc comments for complex logic

### Testing Requirements
* Add/update tests in `__tests__` directories
* Ensure tests pass with `npm test`
* Mock external dependencies appropriately
* Test both success and error cases

### Performance Considerations
* Avoid unnecessary re-renders in React components
* Use React.memo() for expensive components
* Implement proper loading states for async operations
* Keep bundle size small - check imports
* Cache expensive computations where appropriate

## AI Flow Development

### Creating New Flows
1. Define flow in `src/ai/flows/` with descriptive name
2. Use `ai.defineFlow` with proper zod schema
3. Add error handling via `withGenerateErrorHandling`
4. Test in isolation using `npm run genkit:dev`
5. Export from `src/ai/flows/index.ts`
6. Create Server Action in `src/app/actions/ai-flows.ts`
7. Re-export from `src/app/actions/index.ts`

### Flow Best Practices
* Keep prompts clear and specific
* Use structured output schemas for predictable responses
* Implement rate limiting and timeouts
* Log important events via `src/ai/logger.ts`
* Handle errors gracefully with user-friendly messages
* Test with various inputs including edge cases

### Memory System
* User experiences stored in Firestore `users/{userId}/experiences`
* Memory consolidation runs via `memory-consolidation.ts` flow
* Respect user privacy - store only necessary data
* Implement cleanup for old memories if needed
- Error handling: src/ai/error-handler.ts (withErrorHandling wrapper).
- Rate limiting: src/ai/tools/rate-limiter.ts (checkLimit, recordUsage).
- Testing: src/ai/__tests__/rate-limiter.test.ts (Jest patterns).
