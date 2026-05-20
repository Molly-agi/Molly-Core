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
