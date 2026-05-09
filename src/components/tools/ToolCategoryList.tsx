import React from 'react';
import { useToolRegistry } from './ToolRegistryContext';
import { Button } from '@/components/ui/button';

// Helper to group tools by category
function groupByCategory(tools) {
  return tools.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) acc[tool.category] = [];
      acc[tool.category].push(tool);
      return acc;
    },
    {} as Record<string, typeof tools>
  );
}

export const ToolCategoryList = () => {
  const { tools, loading, error, refresh } = useToolRegistry();

  if (loading) return <div>Loading tools…</div>;
  if (error) return <div>Error loading tools: {error}</div>;

  const grouped = groupByCategory(tools);
  const categories = Object.keys(grouped).sort();

  return (
    <div>
      <h2 className="text-lg font-bold mb-2">System Tools by Category</h2>
      <button
        onClick={refresh}
        className="mb-2 px-2 py-1 bg-blue-500 text-white rounded"
      >
        Refresh
      </button>
      {categories.length === 0 && <div>No tools available.</div>}
      {categories.map((cat) => (
        <div key={cat} className="mb-4">
          <h3 className="font-semibold text-blue-300 mb-1 text-sm uppercase tracking-wide">
            {cat}
          </h3>
          <ul className="space-y-1">
            {grouped[cat].map((tool) => (
              <li
                key={tool.name}
                className="border p-2 rounded flex flex-col gap-1 bg-slate-900/60"
              >
                <div className="font-semibold">{tool.name}</div>
                <div className="text-xs text-gray-400">{tool.description}</div>
                {/* Example action button (disabled for now) */}
                <Button
                  size="sm"
                  disabled
                  className="mt-1 opacity-60 cursor-not-allowed"
                >
                  Trigger (coming soon)
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
