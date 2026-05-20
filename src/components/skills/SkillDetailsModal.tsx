import React from 'react';

export interface SkillAgentDetails {
  id: string;
  type: 'skill' | 'agent';
  title?: string;
  description?: string;
  tags?: string[];
  markdown?: string;
  diagnostics?: string[];
  meta?: Record<string, unknown>;
}

interface SkillDetailsModalProps {
  open: boolean;
  onClose: () => void;
  details: SkillAgentDetails | null;
}

export function SkillDetailsModal({
  open,
  onClose,
  details,
}: SkillDetailsModalProps) {
  if (!open || !details) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-2xl w-full p-6 relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-white"
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
        <h2 className="text-xl font-bold mb-2">
          {details.title || details.id}
          <span className="ml-2 text-xs font-mono px-2 py-1 rounded bg-gray-200 dark:bg-zinc-800 text-gray-600 dark:text-gray-300">
            {details.type}
          </span>
        </h2>
        {details.description && (
          <p className="mb-2 text-gray-700 dark:text-gray-300">
            {details.description}
          </p>
        )}
        {details.tags && details.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {details.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 px-2 py-0.5 rounded"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        {details.markdown && (
          <div className="prose dark:prose-invert max-h-64 overflow-y-auto border-t pt-4 mt-4">
            {/* TODO: Use a markdown renderer if available */}
            <pre className="whitespace-pre-wrap text-sm">
              {details.markdown}
            </pre>
          </div>
        )}
        {details.diagnostics && details.diagnostics.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold text-sm mb-1">Diagnostics</h3>
            <ul className="list-disc ml-6 text-xs text-red-600 dark:text-red-400">
              {details.diagnostics.map((diag, i) => (
                <li key={i}>{diag}</li>
              ))}
            </ul>
          </div>
        )}
        {details.meta && (
          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            <h3 className="font-semibold text-sm mb-1">Metadata</h3>
            <pre className="whitespace-pre-wrap">
              {JSON.stringify(details.meta, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
