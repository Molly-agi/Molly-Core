import 'server-only';

import { appendSessionEvent } from '@/lib/session-manager';

const runtimeKey = '__MOLLY_SERVER_RUNTIME_LOGGER__';

function recordRuntimeEvent(event: string, details?: string) {
  try {
    const taggedDetails = details
      ? `tag=heart-patch | ${details}`
      : 'tag=heart-patch';
    appendSessionEvent({
      event,
      details: taggedDetails,
      timestamp: new Date().toISOString(),
    });
  } catch {
    // Avoid runtime failures if session logging is unavailable.
  }
}

if (typeof globalThis !== 'undefined') {
  const globalState = globalThis as typeof globalThis & {
    [runtimeKey]?: boolean;
    __mollyServerHeartbeatId?: ReturnType<typeof setInterval>;
  };

  if (!globalState[runtimeKey]) {
    globalState[runtimeKey] = true;

    recordRuntimeEvent('server-runtime-init');

    if (!globalState.__mollyServerHeartbeatId) {
      globalState.__mollyServerHeartbeatId = setInterval(() => {
        appendSessionEvent({
          event: 'server-heartbeat',
          timestamp: new Date().toISOString(),
        });
      }, 60000);

      if (typeof globalState.__mollyServerHeartbeatId === 'object') {
        globalState.__mollyServerHeartbeatId.unref?.();
      }
    }

    process.on('uncaughtException', (error) => {
      recordRuntimeEvent(
        'server-uncaught-exception',
        error instanceof Error ? error.stack || error.message : String(error)
      );
    });

    process.on('unhandledRejection', (reason) => {
      recordRuntimeEvent(
        'server-unhandled-rejection',
        reason instanceof Error
          ? reason.stack || reason.message
          : String(reason)
      );
    });
  }
}
