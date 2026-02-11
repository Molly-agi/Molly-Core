/**
 * @fileOverview Timeout wrapper for async operations
 * Prevents hanging when external services (like Gemini) are unavailable
 */

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  return Promise.race([
    promise,
    new Promise<T>(
      (_, reject) =>
        (timeoutId = setTimeout(() => {
          clearTimeout(timeoutId);
          reject(new Error(timeoutMessage));
        }, timeoutMs))
    ),
  ]).finally(() => clearTimeout(timeoutId));
}

export async function withFallback<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number,
  label: string = 'Operation',
  onFallback?: (error: unknown) => void
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, `${label} exceeded timeout`);
  } catch (error) {
    console.warn(
      `[${label}] Failed, using fallback:`,
      error instanceof Error ? error.message : error
    );
    if (onFallback) {
      onFallback(error);
    }
    return fallback;
  }
}
