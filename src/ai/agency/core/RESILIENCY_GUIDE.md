# Resiliency Framework Integration Guide

_For Molly - Understanding Your Nervous System_

## Overview

The `resiliency.ts` module provides unified error handling patterns that prevent:

- **Infinite retry loops** (via Circuit Breaker)
- **Lost error context** (via Structured Errors)
- **Stuck recovery attempts** (via Recovery Chains with escalation)

This guide shows how to integrate these patterns into any module.

---

## Core Concepts

### 1. Circuit Breaker

Think of this as a safety fuse. After too many failures, it "opens" and blocks further attempts for a cooldown period. This prevents you from repeatedly trying something that's broken.

**States:**

- `CLOSED` - Normal operation, requests flow through
- `OPEN` - Too many failures, requests blocked (cooling down)
- `HALF_OPEN` - Testing if system recovered, limited requests allowed

**Example:**

```typescript
import { getCircuitBreaker } from './resiliency';

// Create or get a circuit breaker
const myCircuitBreaker = getCircuitBreaker('my-operation', {
  failureThreshold: 5, // Open after 5 failures
  resetTimeoutMs: 60000, // Try again after 1 minute
  successThreshold: 2, // Need 2 successes to fully close
  onOpen: (failures) => {
    console.log(`Circuit opened after ${failures} failures`);
  },
});

// Use it to protect an operation
async function doSomethingRisky() {
  try {
    const result = await myCircuitBreaker.execute(async () => {
      // Your operation here
      return await riskyApiCall();
    });
    return result;
  } catch (error) {
    // Circuit breaker will track this failure
    // After 5 failures, it will block further attempts
  }
}
```

### 2. Structured Errors

Instead of losing error context, wrap errors to preserve:

- Full stack traces
- Nested causes (error chains)
- Severity levels
- Trace IDs for correlation
- Custom metadata

**Example:**

```typescript
import { createStructuredError, wrapError, getErrorChain } from './resiliency';

// Create a new structured error
const error = createStructuredError({
  message: 'Failed to connect to database',
  severity: 'high',
  source: 'my-module',
  metadata: { host: 'localhost', port: 5432 },
});

// Wrap an existing error (preserves the original)
try {
  await somethingThatMightFail();
} catch (err) {
  const structured = wrapError(err, 'my-module', 'medium');
  // Now you have full context preserved
}

// Get the full error chain
const chain = getErrorChain(structured);
// Returns: ['Failed to connect', 'Connection refused', 'ECONNREFUSED']
```

### 3. Recovery Chains

When something fails, try increasingly aggressive fixes in order. If the simple fix doesn't work, escalate to more complex interventions.

**Example:**

```typescript
import {
  createRecoveryChain,
  executeRecoveryChain,
  createStructuredError,
} from './resiliency';

// Define a recovery chain
const myRecoveryChain = createRecoveryChain(
  'api-recovery',
  [
    {
      name: 'retry-once',
      description: 'Simple retry',
      execute: async (error) => {
        // Try the operation again
        return await retryOperation();
      },
    },
    {
      name: 'clear-cache-retry',
      description: 'Clear cache and retry',
      execute: async (error) => {
        await clearCache();
        return await retryOperation();
      },
    },
    {
      name: 'fallback-provider',
      description: 'Switch to backup provider',
      execute: async (error) => {
        return await useBackupProvider();
      },
    },
  ],
  5 // max total attempts
);

// Execute the chain
const error = createStructuredError({
  message: 'API call failed',
  severity: 'high',
  source: 'my-module',
});

const status = await executeRecoveryChain(error, myRecoveryChain);
// Returns: 'success' | 'failed' | 'skipped' | 'escalated'
```

### 4. Retry with Backoff

For simple retries without a full recovery chain, use exponential backoff:

```typescript
import { retryWithBackoff } from './resiliency';

const result = await retryWithBackoff(
  async () => {
    return await apiCall();
  },
  'api-module',
  {
    maxAttempts: 3,
    initialDelayMs: 1000, // Start with 1 second
    maxDelayMs: 30000, // Cap at 30 seconds
    backoffMultiplier: 2, // Double each time
    jitter: true, // Add randomness to prevent thundering herd
  }
);
```

### 5. Protected Execution (All-in-One)

Combines circuit breaker + retry in one convenient wrapper:

```typescript
import { protectedExecution } from './resiliency';

const result = await protectedExecution(
  'my-api-call',
  async () => await apiCall(),
  {
    circuitBreaker: { failureThreshold: 3 },
    retry: { maxAttempts: 2 },
    onError: (error) => {
      // Handle or log the structured error
    },
  }
);
```

---

## Integration Pattern (Step by Step)

### Step 1: Import What You Need

```typescript
import {
  getCircuitBreaker,
  createStructuredError,
  wrapError,
  createRecoveryChain,
  executeRecoveryChain,
  retryWithBackoff,
  protectedExecution,
  type StructuredError,
} from './resiliency';
```

### Step 2: Define Circuit Breakers (if needed)

Place these at module level (not inside functions):

```typescript
const myCircuitBreaker = getCircuitBreaker('my-module-operation', {
  failureThreshold: 5,
  resetTimeoutMs: 5 * 60 * 1000, // 5 minutes
  successThreshold: 1,
});
```

### Step 3: Define Recovery Chains (if needed)

Create a function that returns your recovery chain:

```typescript
function createMyRecoveryChain(): RecoveryChainConfig {
  return createRecoveryChain('my-recovery', [
    // Actions in priority order (lowest priority number = try first)
    { name: 'simple-fix', description: '...', execute: async () => { ... } },
    { name: 'harder-fix', description: '...', execute: async () => { ... } },
    { name: 'escalate', description: '...', execute: async () => { ... } },
  ], 5);
}
```

### Step 4: Wrap Your Critical Operations

**Before (old pattern):**

```typescript
try {
  await riskyOperation();
} catch (err) {
  console.error('Failed:', err); // Context lost!
  throw err;
}
```

**After (with resiliency):**

```typescript
try {
  await myCircuitBreaker.execute(async () => {
    await riskyOperation();
  });
} catch (err) {
  const structured = wrapError(err, 'my-module', 'high');
  // Full context preserved, circuit breaker tracking failures
  throw structured;
}
```

---

## Health Monitoring

Check the overall health of the resiliency system:

```typescript
import { getHealthMetrics, getRecentErrors } from './resiliency';

const health = getHealthMetrics();
// Returns:
// {
//   totalErrors: 42,
//   errorsBySeverity: { low: 10, medium: 20, high: 10, critical: 2 },
//   recoveryAttempts: 15,
//   successfulRecoveries: 12,
//   recoveryRate: 0.8,
//   circuitBreakers: { 'npm-recovery': 'CLOSED', 'server-recovery': 'OPEN' },
//   recentErrorRate: 5,
//   healthScore: 85,
//   lastUpdated: 1711252800000
// }

const recentErrors = getRecentErrors(10);
// Returns last 10 structured errors for analysis
```

---

## Real Example: build-recovery.ts

See how `fixNodeModules()` was updated:

1. **Circuit breaker at module level** prevents infinite npm install loops
2. **Recovery chain** escalates: `npm install` → `npm ci` → request manual help
3. **Structured errors** preserve full context when things fail

The key insight: Instead of each function doing its own error handling, they all use the shared resiliency framework. This ensures consistent behavior across your entire system.

---

## When to Use What

| Situation                             | Use This                                  |
| ------------------------------------- | ----------------------------------------- |
| Simple operation that might fail      | `retryWithBackoff()`                      |
| Critical operation needing protection | `protectedExecution()`                    |
| Operation that fails repeatedly       | `CircuitBreaker`                          |
| Multiple recovery strategies          | `RecoveryChain`                           |
| Preserving error context              | `wrapError()` / `createStructuredError()` |
| Monitoring system health              | `getHealthMetrics()`                      |

---

## Summary

Your resiliency nervous system:

- **Prevents harm** - Circuit breakers stop infinite loops
- **Preserves memory** - Structured errors keep full context
- **Escalates intelligently** - Recovery chains try simple fixes first
- **Self-monitors** - Health metrics track overall system state

Use these patterns consistently, and you'll be more robust and self-correcting.

— Uncle Lazarus
