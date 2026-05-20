import React, { useState, useCallback } from 'react';
import { useSkillRegistry } from './SkillRegistryContext';
import { SkillDetailsModal } from './SkillDetailsModal';
import type { SkillAgentDetails } from './types';

export function SkillRegistryPanelWithModal() {
  const { skills, agents, errors, loading, lastUpdated } = useSkillRegistry();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<SkillAgentDetails | null>(null);
  // const [loadingContent, setLoadingContent] = useState(false);

  // Use SkillMeta or AgentMeta for item type
  const handleOpen = useCallback(
    async (
      item: {
        name: string;
        description: string;
        filePath: string;
        frontmatter: Record<string, unknown>;
      },
      type: 'skill' | 'agent'
    ) => {
      setLoadingContent(true);
      let markdown: string | undefined = undefined;
      try {
        const res = await fetch(
          `/api/skills/content?filePath=${encodeURIComponent(item.filePath)}`
        );
        if (res.ok) {
          const data = await res.json();
          markdown = data.content;
        }
      } catch {}
      setSelected({
        id: item.name,
        type,
        title: item.frontmatter?.title || item.name,
        description: item.description,
        tags: item.frontmatter?.tags || [],
        markdown,
        diagnostics: [],
        meta: item.frontmatter,
      });
      setModalOpen(true);
      setLoadingContent(false);
    },
    []
  );

  // TODO: Fetch markdown content for selected skill/agent if needed

  if (loading)
    return <div className="p-4 text-gray-500">Loading skills&hellip;</div>;
  if (errors && errors.length > 0) {
    return (
      <div className="p-4 text-red-600">
        <strong>Skill/Agent Load Errors:</strong>
        <ul className="list-disc ml-6 mt-2">
          {errors.map((err, i) => (
            <li key={i}>{err}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="p-4 border rounded bg-white/80 shadow">
      <h2 className="font-bold text-lg mb-2">Loaded Skills &amp; Agents</h2>
      <div className="mb-2 text-xs text-gray-500">
        Last updated:{' '}
        {lastUpdated ? new Date(lastUpdated).toLocaleString() : 'never'}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="font-semibold mb-1">Skills</h3>
          {skills.length === 0 ? (
            <div className="text-gray-400">No skills loaded.</div>
          ) : (
            <ul className="list-disc ml-6">
              {skills.map((skill) => (
                <li key={skill.name}>
                  <button
                    className="font-mono text-sm underline text-blue-700 hover:text-blue-900"
                    onClick={() => handleOpen(skill, 'skill')}
                  >
                    {skill.name}
                  </button>
                  {skill.frontmatter?.title && (
                    <span className="ml-2 text-gray-700">
                      {skill.frontmatter.title}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3 className="font-semibold mb-1">Agents</h3>
          {agents.length === 0 ? (
            <div className="text-gray-400">No agents loaded.</div>
          ) : (
            <ul className="list-disc ml-6">
              {agents.map((agent) => (
                <li key={agent.name}>
                  <button
                    className="font-mono text-sm underline text-blue-700 hover:text-blue-900"
                    onClick={() => handleOpen(agent, 'agent')}
                  >
                    {agent.name}
                  </button>
                  {agent.frontmatter?.title && (
                    <span className="ml-2 text-gray-700">
                      {agent.frontmatter.title}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <SkillDetailsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        details={selected}
      />
    </div>
  );
}
