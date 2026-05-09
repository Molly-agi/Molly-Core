import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

export interface SkillMeta {
  name: string;
  description: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
}

export interface AgentMeta {
  name: string;
  description: string;
  filePath: string;
  frontmatter: Record<string, unknown>;
}

export interface Diagnostic {
  filePath: string;
  type: 'skill' | 'agent';
  error: string;
  stack?: string;
}

interface SkillRegistryContextType {
  skills: SkillMeta[];
  agents: AgentMeta[];
  diagnostics: Diagnostic[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const SkillRegistryContext = createContext<
  SkillRegistryContextType | undefined
>(undefined);

export const SkillRegistryProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/skills/list');
      if (!res.ok) throw new Error('Failed to fetch skills/agents');
      const data = await res.json();
      setSkills(data.skills || []);
      setAgents(data.agents || []);
      setDiagnostics(data.diagnostics || []);
      setError(data.error || null);
    } catch (e: unknown) {
      if (e instanceof Error) {
        setError(e.message || 'Unknown error');
      } else {
        setError('Unknown error');
      }
      setSkills([]);
      setAgents([]);
      setDiagnostics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSkills();
  }, []);

  const value: SkillRegistryContextType = {
    skills,
    agents,
    diagnostics,
    loading,
    error,
    refresh: fetchSkills,
  };

  return (
    <SkillRegistryContext.Provider value={value}>
      {children}
    </SkillRegistryContext.Provider>
  );
};

export function useSkillRegistry() {
  const ctx = useContext(SkillRegistryContext);
  if (!ctx)
    throw new Error(
      'useSkillRegistry must be used within a SkillRegistryProvider'
    );
  return ctx;
}
