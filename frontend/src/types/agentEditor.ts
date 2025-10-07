export type AgentRole = 'system' | 'assistant' | 'user' | 'tool';

export interface AgentInteraction {
  id: string;
  agentName: string;
  role: AgentRole;
  summary: string;
  variables: string[];
  content: string;
  createdAt: string;
  updatedAt: string;
}
