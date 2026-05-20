import React from 'react';
import { useToolRegistry } from './ToolRegistryContext';

export const ToolList = () => {
  const { tools, loading, error, refresh } = useToolRegistry();

  if (loading) return <div>Loading tools…</div>;
  if (error) return <div>Error loading tools: {error}</div>;

  return (
    <div>
      <h2 className="text-lg font-bold mb-2">Available Tools</h2>
      <button
        onClick={refresh}
        className="mb-2 px-2 py-1 bg-blue-500 text-white rounded"
      >
        Refresh
      </button>
      <ul className="space-y-1">
        {tools.map((tool) => (
          <li key={tool.name} className="border p-2 rounded">
            <div className="font-semibold">{tool.name}</div>
            <div className="text-sm text-gray-600">{tool.description}</div>
            <div className="text-xs text-gray-400">
              Category: {tool.category}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
