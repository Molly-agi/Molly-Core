'use client';

import { useRef, useState, useCallback } from 'react';
import {
  diagnoseMollyNeuralLink,
  restoreMollyNeuralLink,
  getCircuitBreakerStatus,
  getRuntimeSnapshot,
  resetCircuitBreaker,
  testModelAvailability,
} from '@/app/actions';
import type { RuntimeSnapshot } from '@/ai/tools/runtime-snapshot';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { formatRelativeTime } from '@/components/diagnostic-time';

type ResultEntry = {
  label: string;
  status: 'ok' | 'error';
  summary: string;
  data?: unknown;
};

type RuntimeSnapshotFallback = {
  timestamp: string;
  status: string;
  timeoutMs: number;
  message: string;
};

type RuntimeSnapshotState = RuntimeSnapshot | RuntimeSnapshotFallback;

function isFullSnapshot(s: RuntimeSnapshotState): s is RuntimeSnapshot {
  return 'circuitBreaker' in s;
}

/** Client-side timeout wrapper. Never lets a server action hang the UI forever. */
const CLIENT_ACTION_TIMEOUT_MS = 25000;

function withClientTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `${label} — no response after ${CLIENT_ACTION_TIMEOUT_MS / 1000}s. The server may be overloaded.`
            )
          ),
        CLIENT_ACTION_TIMEOUT_MS
      )
    ),
  ]);
}

type ActionKey =
  | 'diagnostic'
  | 'recovery'
  | 'circuitBreaker'
  | 'models'
  | 'reset';

export function DiagnosticPanel() {
  // Per-action loading states — one stuck action can't lock out the others
  const [activeActions, setActiveActions] = useState<Set<ActionKey>>(new Set());
  const [results, setResults] = useState<ResultEntry | null>(null);
  const [runtimeSnapshot, setRuntimeSnapshot] =
    useState<RuntimeSnapshotState | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [runtimeLastUpdated, setRuntimeLastUpdated] = useState<string | null>(
    null
  );
  const [showJson, setShowJson] = useState(false);
  const runtimeInFlight = useRef(false);

  const isActionActive = (key: ActionKey) => activeActions.has(key);
  const anyActionActive = activeActions.size > 0;

  const startAction = useCallback((key: ActionKey) => {
    setActiveActions((prev) => new Set(prev).add(key));
  }, []);

  const endAction = useCallback((key: ActionKey) => {
    setActiveActions((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // ── helpers ────────────────────────────────────────────────

  const wrap = async (
    actionKey: ActionKey,
    label: string,
    fn: () => Promise<Record<string, unknown>>
  ) => {
    if (isActionActive(actionKey)) return; // prevent double-click
    startAction(actionKey);
    setShowJson(false);
    try {
      const data = await withClientTimeout(fn(), label);
      const summary =
        data?.diagnosis || data?.message || data?.globalState || 'Done';
      setResults({ label, status: 'ok', summary: String(summary), data });
    } catch (e) {
      setResults({
        label,
        status: 'error',
        summary: e instanceof Error ? e.message : String(e),
      });
    } finally {
      endAction(actionKey);
    }
  };

  // ── actions ────────────────────────────────────────────────

  const runDiagnostic = () =>
    wrap('diagnostic', 'Diagnostic', diagnoseMollyNeuralLink);

  const runRecovery = () =>
    wrap('recovery', 'Recovery', restoreMollyNeuralLink);

  const checkCircuitBreaker = () =>
    wrap('circuitBreaker', 'Circuit Breaker', getCircuitBreakerStatus);

  const testModels = () => wrap('models', 'Model Test', testModelAvailability);

  const resetBreaker = (op?: string) =>
    wrap('reset', 'Breaker Reset', async () => {
      await resetCircuitBreaker(op);
      return getCircuitBreakerStatus();
    });

  const fetchRuntimeSnapshot = async () => {
    if (runtimeInFlight.current) return;
    runtimeInFlight.current = true;
    setRuntimeLoading(true);
    try {
      const snapshot = await withClientTimeout(
        getRuntimeSnapshot(),
        'Runtime Snapshot'
      );
      setRuntimeSnapshot(snapshot);
      setRuntimeLastUpdated(new Date().toISOString());
    } catch (e) {
      setRuntimeSnapshot({
        timestamp: new Date().toISOString(),
        status: 'error',
        timeoutMs: CLIENT_ACTION_TIMEOUT_MS,
        message: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setRuntimeLoading(false);
      runtimeInFlight.current = false;
    }
  };

  // ── render ─────────────────────────────────────────────────

  return (
    <div className="space-y-4 w-full">
      {/* Runtime Snapshot (compact) */}
      <div className="bg-muted border rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">
            RUNTIME SNAPSHOT
          </p>
          <Button
            onClick={fetchRuntimeSnapshot}
            disabled={runtimeLoading}
            size="sm"
            variant="outline"
            className="h-7"
          >
            {runtimeLoading ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3" />
            )}
            Refresh
          </Button>
        </div>

        {runtimeSnapshot ? (
          isFullSnapshot(runtimeSnapshot) ? (
            <div className="grid grid-cols-2 gap-1 text-xs">
              <div>
                <span className="text-muted-foreground">Circuit:</span>{' '}
                {runtimeSnapshot.circuitBreaker?.globalState || '—'}
              </div>
              <div>
                <span className="text-muted-foreground">Open Ops:</span>{' '}
                {runtimeSnapshot.circuitBreaker?.openOperations?.length || 0}
              </div>
              <div>
                <span className="text-muted-foreground">Memory:</span>{' '}
                {runtimeSnapshot.memoryHealth?.status || '—'}
              </div>
              <div>
                <span className="text-muted-foreground">CPU:</span>{' '}
                {runtimeSnapshot.systemHealth?.cpuUsage ?? '—'}%
              </div>
              <div className="col-span-2 text-muted-foreground text-[10px]">
                Updated {formatRelativeTime(runtimeLastUpdated, Date.now())}
              </div>
            </div>
          ) : (
            <p className="text-xs text-yellow-500">{runtimeSnapshot.message}</p>
          )
        ) : (
          <p className="text-xs text-muted-foreground">
            Press Refresh to load snapshot.
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <Card className="bg-muted/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Neural Link Toolkit
          </CardTitle>
          <CardDescription className="text-xs">
            Diagnostics &amp; recovery tools
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Emergency Reset — NEVER disabled by other actions */}
          <Button
            onClick={() => resetBreaker()}
            disabled={isActionActive('reset')}
            className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold"
          >
            {isActionActive('reset') ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Reset All Circuit Breakers
          </Button>

          {/* Core actions */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={runDiagnostic}
              disabled={isActionActive('diagnostic')}
              variant="outline"
              size="sm"
              className="gap-1"
            >
              {isActionActive('diagnostic') ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <AlertTriangle className="w-3 h-3" />
              )}
              Diagnostic
            </Button>
            <Button
              onClick={runRecovery}
              disabled={isActionActive('recovery')}
              size="sm"
              className="gap-1 bg-green-600 hover:bg-green-700 text-white"
            >
              {isActionActive('recovery') ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RefreshCw className="w-3 h-3" />
              )}
              Restore Link
            </Button>
            <Button
              onClick={checkCircuitBreaker}
              disabled={isActionActive('circuitBreaker')}
              variant="secondary"
              size="sm"
            >
              {isActionActive('circuitBreaker') ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              Circuit Status
            </Button>
            <Button
              onClick={testModels}
              disabled={isActionActive('models')}
              variant="secondary"
              size="sm"
            >
              {isActionActive('models') ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : null}
              Test Models
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results (unified) */}
      {results && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              {results.status === 'error' ? (
                <AlertTriangle className="w-4 h-4 text-red-500" />
              ) : (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {results.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-sm mb-2 ${results.status === 'error' ? 'text-red-500' : ''}`}
            >
              {results.summary}
            </p>

            {results.data != null && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2 text-muted-foreground"
                  onClick={() => setShowJson((v) => !v)}
                >
                  {showJson ? 'Hide' : 'Show'} Details
                </Button>
                {showJson && (
                  <pre className="mt-2 bg-muted p-3 rounded font-mono text-xs max-h-64 overflow-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(results.data, null, 2)}
                  </pre>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
