# Copilot Instructions for Molly-Core

## Project Overview
Molly-Core is a Next.js 15 AI assistant application using Google GenAI (via Genkit), Firebase (Auth/Firestore), TypeScript, React 19, and Tailwind CSS. The app features conversational AI, memory/learning systems, and voice interaction capabilities.

## Big picture architecture
- Next.js App Router UI lives in src/app with root wiring in src/app/layout.tsx.
- Server Actions are defined in src/app/actions/ai-flows.ts and re-exported from src/app/actions/index.ts; these call Genkit flows in src/ai/flows.
- Genkit setup and model IDs are in src/ai/genkit.ts; most flows use ai.defineFlow with zod schemas.
- Structured logging + error handling live in src/ai/logger.ts and src/ai/error-handler.ts; wrap flow calls via withGenerateErrorHandling where applicable.
- Memory and learning live in src/ai/memory and src/ai/flows/memory-consolidation.ts, persisting to Firestore users/{userId}/experiences.
- Firebase client wiring is in src/firebase (initializeFirebase in src/firebase/index.ts) and is provided to the app by FirebaseClientProvider in layout.

## Environment Setup (REQUIRED)
**ALWAYS set up environment before any operations:**
1. Copy `.env.local.example` to `.env.local`
2. Add required `GOOGLE_GENAI_API_KEY` from https://aistudio.google.com/app/apikey
3. Firebase config is embedded in code but can be overridden via environment variables
4. Without the API key, the application will not function

## Build & Validation Commands
**ALWAYS run commands in this exact order to avoid failures:**

### Initial Setup
```bash
npm install  # Install dependencies (takes ~30-60 seconds)
```

### Development
```bash
npm run dev              # Start Next.js dev server on port 9002 (initial build ~60-90 seconds)
npm run dev:turbo        # Faster dev mode using Turbo
npm run dev:fresh        # Clean start: runs harden then dev
npm run debug            # Start with Node.js inspector
npm run genkit:dev       # Start Genkit dev UI for flow testing
npm run genkit:watch     # Genkit dev with auto-reload
```

### Build & Type Checking
```bash
npm run harden           # Clean .next cache (use before builds)
npm run build            # Production build (takes 90-120 seconds, requires harden first)
npm run typecheck        # TypeScript check without emitting (takes ~10-15 seconds)
npm run lint             # Run ESLint (takes ~5-10 seconds)
npm run format           # Format code with Prettier
```

### Testing
```bash
npm run test             # Run Jest in watch mode
# For CI: npm test -- --ci --coverage --maxWorkers=2
```

### Known Build Issues & Workarounds
- **Memory issues during build**: Build script uses `NODE_OPTIONS=--max-old-space-size=4096`
- **Stale cache problems**: ALWAYS run `npm run harden` before `npm run build`
- **Port conflicts**: Dev server uses port 9002 by default
- **First build timing**: Initial builds can take up to 2 minutes; subsequent builds are faster

## Project-specific conventions
- Keep Molly personality core protected: src/ai/persona.ts is read-only unless explicit user permission is provided.
- Many flows use "use server" at top; keep it intact for Server Actions and flows.
- Server Actions must receive serializable data; use serializeHistoryForServer in src/app/actions/utils.ts when passing chat history.
- Rate limiting, timeouts, and circuit breaking are enforced in server actions via src/ai/tools and src/app/actions/utils.ts.
- Use `@/` path alias for imports from `src/` directory (configured in tsconfig.json)
- TypeScript is configured with `strict: false` but `strictNullChecks: true`

## Project Structure
```
src/
├── ai/                      # Core AI functionality
│   ├── flows/              # Genkit AI flows (30+ flows)
│   ├── memory/             # Memory system
│   ├── tools/              # AI tools and utilities
│   ├── genkit.ts           # Genkit configuration
│   ├── persona.ts          # Molly's personality (READ-ONLY)
│   └── error-handler.ts    # Error handling utilities
├── app/                     # Next.js App Router
│   ├── actions/            # Server Actions
│   ├── api/                # API routes
│   └── layout.tsx          # Root layout
├── components/             # React components
├── firebase/               # Firebase configuration
├── hooks/                  # React hooks
├── lib/                    # Utility libraries
├── types/                  # TypeScript type definitions
└── pages/                  # Legacy pages (if any)

Key Configuration Files:
- package.json              # Scripts and dependencies
- tsconfig.json             # TypeScript config (paths alias, strict settings)
- jest.config.mjs           # Jest test configuration
- next.config.js            # Next.js configuration
- tailwind.config.ts        # Tailwind CSS config
- .eslintrc.json            # ESLint rules
- firestore.rules           # Firestore security rules
```

## Integration points
- Genkit (Google GenAI): models defined in src/ai/genkit.ts.
- Firebase Auth/Firestore: initializeFirebase on client, initializeFirebaseServer on server.
- Voice pipeline: src/ai/flows/text-to-speech.ts and src/ai/flows/voice-command-to-text.ts.
- Radix UI components for UI primitives (see src/components)

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
