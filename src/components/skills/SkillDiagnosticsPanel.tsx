import React from 'react';
import { useSkillRegistry } from './SkillRegistryContext';

export function SkillDiagnosticsPanel() {
  const { diagnostics, loading } = useSkillRegistry();

  if (loading) return null;
  if (!diagnostics || diagnostics.length === 0) return null;

  return (
    <div className="p-4 border rounded bg-red-50 dark:bg-red-900/20 shadow mt-4">
      <h2 className="font-bold text-lg mb-2 text-red-700 dark:text-red-300">
        Skill/Agent Diagnostics
      </h2>
      <ul className="list-disc ml-6 text-sm">
        {diagnostics.map((diag, i) => (
          <li key={i} className="mb-2">
            <span className="font-mono text-xs bg-gray-200 dark:bg-zinc-800 px-1 py-0.5 rounded mr-2">
              {diag.type}
            </span>
            <span className="font-mono text-xs text-gray-600 dark:text-gray-300">
              {diag.filePath}
            </span>
            <div className="text-red-700 dark:text-red-300 mt-1">
              {diag.error}
            </div>
            {diag.stack && (
              <details className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                <summary>Stack trace</summary>
                <pre className="whitespace-pre-wrap">{diag.stack}</pre>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
