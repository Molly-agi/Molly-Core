import React from 'react';
import { useSkillRegistry } from './SkillRegistryContext';

export function SkillRegistryPanel() {
  const { skills, agents, errors, loading, lastUpdated } = useSkillRegistry();

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
                <li key={skill.id}>
                  <span className="font-mono text-sm">{skill.id}</span>
                  {skill.title && (
                    <span className="ml-2 text-gray-700">{skill.title}</span>
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
                <li key={agent.id}>
                  <span className="font-mono text-sm">{agent.id}</span>
                  {agent.title && (
                    <span className="ml-2 text-gray-700">{agent.title}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
