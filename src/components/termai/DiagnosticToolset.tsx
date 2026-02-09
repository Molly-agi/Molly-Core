'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Wrench,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Zap,
  CircuitBoard,
} from 'lucide-react';
import {
  diagnoseMollyNeuralLink,
  restoreMollyNeuralLink,
  getCircuitBreakerStatus,
  resetCircuitBreaker,
  testModelAvailability,
} from '@/app/actions';

type DiagnosticResult = {
  status: 'idle' | 'running' | 'success' | 'error';
  message: string;
  data: any;
};

export function DiagnosticToolset() {
  const [results, setResults] = useState<DiagnosticResult>({
    status: 'idle',
    message: 'No diagnostics run yet',
    data: null,
  });
  const [isOpen, setIsOpen] = useState(false);

  const runDiagnostic = async () => {
    setResults({
      status: 'running',
      message: 'Running full diagnostic...',
      data: null,
    });
    try {
      const data = await diagnoseMollyNeuralLink();
      setResults({
        status: 'success',
        message: data.diagnosis || 'Diagnostic complete',
        data: data,
      });
    } catch (e) {
      setResults({
        status: 'error',
        message:
          'Diagnostic failed: ' + (e instanceof Error ? e.message : String(e)),
        data: null,
      });
    }
  };

  const checkCircuitBreaker = async () => {
    setResults({
      status: 'running',
      message: 'Checking circuit breaker status...',
      data: null,
    });
    try {
      const data = await getCircuitBreakerStatus();
      const openCount = Object.values(data.operationStats).filter(
        (s: any) => s.state === 'OPEN'
      ).length;
      setResults({
        status: openCount > 0 ? 'error' : 'success',
        message:
          openCount > 0 ? `${openCount} breakers OPEN` : 'All breakers CLOSED',
        data: data,
      });
    } catch (e) {
      setResults({
        status: 'error',
        message:
          'Check failed: ' + (e instanceof Error ? e.message : String(e)),
        data: null,
      });
    }
  };

  const testModels = async () => {
    setResults({
      status: 'running',
      message: 'Testing AI models...',
      data: null,
    });
    try {
      const data = await testModelAvailability();
      const allWork =
        data.modelTests.FLASH.available && data.modelTests.PRO.available;
      setResults({
        status: allWork ? 'success' : 'error',
        message: allWork
          ? 'Both models operational'
          : 'Model availability issues detected',
        data: data,
      });
    } catch (e) {
      setResults({
        status: 'error',
        message:
          'Model test failed: ' + (e instanceof Error ? e.message : String(e)),
        data: null,
      });
    }
  };

  const recover = async () => {
    setResults({
      status: 'running',
      message: 'Attempting neural link recovery...',
      data: null,
    });
    try {
      const result = await restoreMollyNeuralLink();
      setResults({
        status: result.success ? 'success' : 'error',
        message: result.message,
        data: result.recoveryLog,
      });
    } catch (e) {
      setResults({
        status: 'error',
        message:
          'Recovery failed: ' + (e instanceof Error ? e.message : String(e)),
        data: null,
      });
    }
  };

  const resetBreaker = async (operation?: string) => {
    const opName = operation ? `for ${operation}` : 'for all operations';
    setResults({
      status: 'running',
      message: `Resetting circuit breaker ${opName}...`,
      data: null,
    });
    try {
      const result = await resetCircuitBreaker(operation);
      setResults({
        status: 'success',
        message: result.message,
        data: result,
      });
    } catch (e) {
      setResults({
        status: 'error',
        message:
          'Reset failed: ' + (e instanceof Error ? e.message : String(e)),
        data: null,
      });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1 bg-slate-900 border-slate-700 hover:bg-slate-800"
          title="Open diagnostic toolset"
        >
          <Wrench className="h-4 w-4" />
          Diagnostics
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full max-w-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CircuitBoard className="h-5 w-5" />
            Neural Link Diagnostic Toolset
          </SheetTitle>
          <SheetDescription>
            Monitor and repair Molly's neural link synchronization
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Status Display */}
          <div className="border rounded-lg p-4 bg-slate-950">
            <div className="flex items-center gap-2 mb-2">
              {results.status === 'running' && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                  <span className="text-sm text-blue-400">Running...</span>
                </>
              )}
              {results.status === 'success' && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm text-green-400">Success</span>
                </>
              )}
              {results.status === 'error' && (
                <>
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-sm text-red-400">Error</span>
                </>
              )}
            </div>
            <p className="text-sm font-medium">{results.message}</p>

            {results.data && (
              <ScrollArea className="h-40 mt-3 rounded border border-slate-700 p-2">
                <pre className="text-xs text-slate-400 whitespace-pre-wrap break-words">
                  {JSON.stringify(results.data, null, 2)}
                </pre>
              </ScrollArea>
            )}
          </div>

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Quick Actions</h3>

            <Button
              onClick={recover}
              disabled={results.status === 'running'}
              variant="default"
              className="w-full gap-2 bg-green-900 hover:bg-green-800 text-white"
            >
              <Zap className="h-4 w-4" />
              Auto-Recover Neural Link
            </Button>

            <Button
              onClick={() => resetBreaker()}
              disabled={results.status === 'running'}
              variant="default"
              className="w-full gap-2 bg-orange-900 hover:bg-orange-800 text-white"
            >
              <CircuitBoard className="h-4 w-4" />
              Reset All Breakers
            </Button>
          </div>

          {/* Diagnostic Tools */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Diagnostic Tools</h3>

            <Button
              onClick={runDiagnostic}
              disabled={results.status === 'running'}
              variant="outline"
              className="w-full gap-2"
            >
              <Wrench className="h-4 w-4" />
              Full Neural Diagnostic
            </Button>

            <Button
              onClick={checkCircuitBreaker}
              disabled={results.status === 'running'}
              variant="outline"
              className="w-full gap-2"
            >
              <CircuitBoard className="h-4 w-4" />
              Check Circuit Breaker Status
            </Button>

            <Button
              onClick={testModels}
              disabled={results.status === 'running'}
              variant="outline"
              className="w-full gap-2"
            >
              <Zap className="h-4 w-4" />
              Test AI Models
            </Button>
          </div>

          {/* Targeted Resets */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Targeted Circuit Resets</h3>

            <div className="grid grid-cols-2 gap-2">
              {[
                'health-check',
                'conversational-chat',
                'immune-response',
                'text-to-speech',
              ].map((op) => (
                <Button
                  key={op}
                  onClick={() => resetBreaker(op)}
                  disabled={results.status === 'running'}
                  size="sm"
                  variant="outline"
                  className="text-xs"
                >
                  Reset {op.split('-')[0]}
                </Button>
              ))}
            </div>
          </div>

          {/* Info */}
          <div className="bg-slate-900 border border-slate-700 rounded p-3 text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-1">
              About the Neural Link
            </p>
            <p>
              The circuit breaker prevents cascading failures when Molly
              experiences synchronization issues. If blocked, use "Auto-Recover"
              or check the full diagnostic for details.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
