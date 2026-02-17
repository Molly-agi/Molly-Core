'use client';

import { useState } from 'react';
import {
  diagnoseMollyNeuralLink,
  restoreMollyNeuralLink,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  testModelAvailability,
} from '@/app/actions';
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
  Code,
} from 'lucide-react';
import { fetchRecentSystemLogs } from '@/firebase/system-logger';

export function DiagnosticPanel() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'status' | 'recovery' | 'models'>(
    'status'
  );
  const [results, setResults] = useState<any>(null);

  const fetchClientErrors = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/client-errors');
      if (!response.ok) {
        throw new Error('Failed to fetch client errors');
      }
      const data = await response.json();
      setResults({ type: 'client-errors', data });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchSessionState = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/session/state');
      if (!response.ok) {
        throw new Error('Failed to fetch session state');
      }
      const data = await response.json();
      setResults({ type: 'session-state', data });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFullDiagnostics = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/health/full-diagnostics');
      if (!response.ok) {
        throw new Error('Failed to fetch full diagnostics');
      }
      const data = await response.json();
      setResults({ type: 'full-diagnostics', data });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchFirestoreLogs = async () => {
    setLoading(true);
    try {
      const logs = await fetchRecentSystemLogs(30);
      setResults({ type: 'firestore-logs', data: logs });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const runDiagnostic = async () => {
    setLoading(true);
    try {
      const diag = await diagnoseMollyNeuralLink();
      setResults({ type: 'diagnostic', data: diag });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const runRecovery = async () => {
    setLoading(true);
    try {
      const recovery = await restoreMollyNeuralLink();
      setResults({ type: 'recovery', data: recovery });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const checkCircuitBreaker = async () => {
    setLoading(true);
    try {
      const status = await getCircuitBreakerStatus();
      setResults({ type: 'breaker-status', data: status });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const testModels = async () => {
    setLoading(true);
    try {
      const models = await testModelAvailability();
      setResults({ type: 'models', data: models });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  const resetBreaker = async (operation?: string) => {
    setLoading(true);
    try {
      await resetCircuitBreaker(operation);
      const status = await getCircuitBreakerStatus();
      setResults({
        type: 'breaker-reset',
        data: { operation: operation || 'ALL', status },
      });
    } catch (e) {
      setResults({
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 w-full">
      {/* Button Toolbar */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-5 h-5" />
            Neural Link Toolkit
          </CardTitle>
          <CardDescription>
            Diagnostics & recovery tools for Molly's system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* EMERGENCY RESET - Most prominent */}
          <div className="bg-orange-500/10 border-2 border-orange-500/50 rounded-lg p-3">
            <Button
              onClick={() => resetBreaker()}
              disabled={loading}
              className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white font-bold"
              size="lg"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <RefreshCw className="w-5 h-5" />
              )}
              EMERGENCY: Reset All Circuit Breakers
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Use this if Molly becomes unresponsive due to circuit breaker
              trips
            </p>
          </div>

          {/* Main Action Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={runDiagnostic}
              disabled={loading}
              variant="outline"
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
              Full Diagnostic
            </Button>
            <Button
              onClick={runRecovery}
              disabled={loading}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Restore Neural Link
            </Button>
          </div>

          {/* Secondary diagnostic buttons */}
          <div className="border-t pt-3">
            <p className="text-xs font-semibold mb-2 text-muted-foreground">
              DETAILED CHECKS
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={fetchFullDiagnostics}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <Code className="w-3 h-3 mr-1" />
                Full Diagnostics
              </Button>
              <Button
                onClick={checkCircuitBreaker}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <Code className="w-3 h-3 mr-1" />
                Circuit Status
              </Button>
              <Button
                onClick={testModels}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <Code className="w-3 h-3 mr-1" />
                Test Models
              </Button>
              <Button
                onClick={fetchClientErrors}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <Code className="w-3 h-3 mr-1" />
                Client Errors
              </Button>
              <Button
                onClick={fetchSessionState}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <Code className="w-3 h-3 mr-1" />
                Session State
              </Button>
              <Button
                onClick={fetchFirestoreLogs}
                disabled={loading}
                size="sm"
                variant="secondary"
              >
                <Code className="w-3 h-3 mr-1" />
                Firestore Logs
              </Button>
            </div>
          </div>

          {/* Circuit Breaker Manual Reset */}
          {results?.type === 'breaker-status' && (
            <div className="border-t pt-3">
              <p className="text-xs font-semibold mb-2 text-muted-foreground">
                MANUAL RESET
              </p>
              <div className="grid grid-cols-2 gap-1 max-h-32 overflow-y-auto">
                {Object.entries(results.data?.operationStats || {}).map(
                  ([op, stats]: [string, any]) => (
                    <Button
                      key={op}
                      onClick={() => resetBreaker(op)}
                      disabled={loading || stats.state === 'CLOSED'}
                      size="sm"
                      variant={stats.state === 'OPEN' ? 'destructive' : 'ghost'}
                      className="text-xs h-7"
                      title={`State: ${stats.state}`}
                    >
                      Reset {op}
                    </Button>
                  )
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Display */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {results.type === 'error' ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Error
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  Results
                </>
              )}
            </CardTitle>
            {results.type === 'full-diagnostics' &&
              results.data?.checks?.latencyCache && (
                <CardDescription>
                  {(() => {
                    const cache = results.data.checks.latencyCache;
                    const byPrefix = cache.byPrefix || {};
                    const textAvg = byPrefix.text?.avg ?? null;
                    const voiceAvg = byPrefix.voice?.avg ?? null;
                    const parts = [] as string[];
                    if (textAvg !== null) parts.push(`text avg ${textAvg}ms`);
                    if (voiceAvg !== null)
                      parts.push(`voice avg ${voiceAvg}ms`);
                    return `Latency cache: ${cache.totalEntries} entries${parts.length ? ` (${parts.join(', ')})` : ''}`;
                  })()}
                </CardDescription>
              )}
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-3 rounded font-mono text-xs max-h-96 overflow-y-auto">
              {results.type === 'error' ? (
                <pre className="text-red-600 whitespace-pre-wrap break-words">
                  {results.error}
                </pre>
              ) : results.type === 'diagnostic' ? (
                <div className="space-y-2">
                  <p className="font-semibold text-base">
                    {results.data.diagnosis}
                  </p>
                  <div className="mt-3">
                    <p className="text-xs font-semibold mb-2">
                      Recommendations:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {results.data.recommendations.map(
                        (rec: string, i: number) => (
                          <li key={i} className="text-xs">
                            {rec}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-semibold">
                      Full Details
                    </summary>
                    <pre className="mt-2 overflow-auto">
                      {JSON.stringify(results.data, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : results.type === 'recovery' ? (
                <div>
                  <p className="font-semibold mb-2">
                    Recovery:{' '}
                    {results.data.success ? '✅ SUCCESS' : '❌ PARTIAL'}
                  </p>
                  <p className="mb-3">{results.data.message}</p>
                  <details>
                    <summary className="cursor-pointer font-semibold">
                      View Recovery Log
                    </summary>
                    <pre className="mt-2 overflow-auto">
                      {JSON.stringify(results.data.recoveryLog, null, 2)}
                    </pre>
                  </details>
                </div>
              ) : results.type === 'breaker-status' ? (
                <div>
                  <p className="font-semibold mb-3">Circuit Breaker Status</p>
                  <pre>{JSON.stringify(results.data, null, 2)}</pre>
                </div>
              ) : results.type === 'models' ? (
                <div>
                  <p className="font-semibold mb-3">Model Availability Test</p>
                  <pre>{JSON.stringify(results.data, null, 2)}</pre>
                </div>
              ) : results.type === 'client-errors' ? (
                <div>
                  <p className="font-semibold mb-3">Recent Client Errors</p>
                  <pre>{JSON.stringify(results.data, null, 2)}</pre>
                </div>
              ) : results.type === 'session-state' ? (
                <div>
                  <p className="font-semibold mb-3">Session State</p>
                  <pre>{JSON.stringify(results.data, null, 2)}</pre>
                </div>
              ) : results.type === 'firestore-logs' ? (
                <div>
                  <p className="font-semibold mb-3">Firestore Logs</p>
                  <pre>{JSON.stringify(results.data, null, 2)}</pre>
                </div>
              ) : results.type === 'full-diagnostics' ? (
                <div>
                  <p className="font-semibold mb-3">Full Diagnostics</p>
                  {results.data?.checks?.latencyCache && (
                    <div className="mb-3">
                      <p className="font-semibold mb-2">Latency Cache</p>
                      <pre>
                        {JSON.stringify(
                          results.data.checks.latencyCache,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                  <pre>{JSON.stringify(results.data, null, 2)}</pre>
                </div>
              ) : (
                <pre>{JSON.stringify(results, null, 2)}</pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
