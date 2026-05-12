'use client';
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

export interface ToolDefinition {
  name: string;
  description: string;
  category: string;
  example?: string;
  availableOffline: boolean;
  rogueHighlight: boolean;
  availableRobot: boolean;
}

interface ToolRegistryContextType {
  tools: ToolDefinition[];
  refresh: () => void;
  loading: boolean;
  error: string | null;
}

const ToolRegistryContext = createContext<ToolRegistryContextType | undefined>(
  undefined
);

export const ToolRegistryProvider = ({ children }: { children: ReactNode }) => {
  const [tools, setTools] = useState<ToolDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tools/list');
      if (!res.ok) throw new Error('Failed to fetch tools');
      const data = await res.json();
      setTools(data.tools || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, []);

  return (
    <ToolRegistryContext.Provider
      value={{ tools, refresh: fetchTools, loading, error }}
    >
      {children}
    </ToolRegistryContext.Provider>
  );
};

export const useToolRegistry = () => {
  const ctx = useContext(ToolRegistryContext);
  if (!ctx)
    throw new Error('useToolRegistry must be used within ToolRegistryProvider');
  return ctx;
};
