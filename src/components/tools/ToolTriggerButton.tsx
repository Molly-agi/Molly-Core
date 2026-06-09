'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ToolDefinition } from './ToolRegistryContext';

interface ExecuteResult {
  success: boolean;
  output: string;
}

function isValidJsonObject(raw: string): boolean {
  if (!raw.trim()) return true;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function ToolTriggerButton({ tool }: { tool: ToolDefinition }) {
  const hasExample = !!tool.example?.trim();

  const [expanded, setExpanded] = useState(false);
  const [paramsText, setParamsText] = useState(tool.example ?? '{}');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExecuteResult | null>(null);

  const fire = async () => {
    let params: Record<string, unknown> = {};
    const raw = paramsText.trim();
    if (raw) {
      if (!isValidJsonObject(raw)) {
        setResult({
          success: false,
          output: 'Params must be a JSON object (e.g. {"foo": "bar"}).',
        });
        return;
      }
      params = JSON.parse(raw);
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/tools/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: tool.name, params }),
      });
      const data: ExecuteResult = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        output: `Request failed: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const onTrigger = () => {
    if (!hasExample) {
      fire();
      return;
    }
    setExpanded((e) => !e);
  };

  return (
    <div className="flex flex-col gap-2 mt-1">
      <Button size="sm" onClick={onTrigger} disabled={loading} className="w-fit">
        {loading ? 'Running...' : hasExample ? (expanded ? 'Cancel' : 'Trigger') : 'Trigger'}
      </Button>

      {hasExample && expanded && (
        <div className="flex flex-col gap-2 p-2 bg-slate-950/60 rounded border border-slate-700">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-gray-300">Params (JSON)</span>
            <textarea
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
              rows={4}
              className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-gray-100 font-mono text-[11px]"
              spellCheck={false}
            />
          </label>
          <Button size="sm" onClick={fire} disabled={loading} className="w-fit">
            {loading ? 'Running...' : 'Submit'}
          </Button>
        </div>
      )}

      {result && (
        <div
          className={`text-[11px] p-2 rounded border max-h-48 overflow-y-auto whitespace-pre-wrap font-mono ${
            result.success
              ? 'bg-green-950/40 border-green-800 text-green-200'
              : 'bg-red-950/40 border-red-800 text-red-200'
          }`}
        >
          {result.output}
        </div>
      )}
    </div>
  );
}
