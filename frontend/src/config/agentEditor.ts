import type { AgentInteraction, AgentRole } from '@/types/agentEditor';

const ROLE_VALUES: AgentRole[] = ['system', 'assistant', 'user', 'tool'];

const resolveRole = (value: string | undefined): AgentRole => {
  if (!value) {
    return 'assistant';
  }

  return ROLE_VALUES.includes(value as AgentRole)
    ? (value as AgentRole)
    : 'assistant';
};

const toNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallback;
};

const normalizeBaseUrl = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/\/+$/, '');
};

const toBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (typeof value === 'undefined') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  return fallback;
};

export const AGENT_EDITOR_ENABLED =
  (import.meta.env.VITE_AGENT_EDITOR_ENABLED ?? 'true').toLowerCase() !==
  'false';

export const DEFAULT_AGENT_NAME =
  import.meta.env.VITE_AGENT_EDITOR_DEFAULT_NAME || 'Orion';

export const DEFAULT_AGENT_ROLE = resolveRole(
  import.meta.env.VITE_AGENT_EDITOR_DEFAULT_ROLE
);

export const AGENT_EDITOR_STORAGE_KEY =
  import.meta.env.VITE_AGENT_EDITOR_STORAGE_KEY ||
  'chainlit.agent-editor.draft';

export const AGENT_EDITOR_AUTOSAVE_DELAY_MS = toNumber(
  import.meta.env.VITE_AGENT_EDITOR_AUTOSAVE_DELAY_MS,
  750
);

export const AGENT_EDITOR_API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_AGENT_EDITOR_API_BASE_URL
);

export const AGENT_EDITOR_REMOTE_PUBLISH_ENABLED = toBoolean(
  import.meta.env.VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED,
  true
);

export const AGENT_EDITOR_REMOTE_PUBLISH_CONFIRMATION =
  import.meta.env.VITE_AGENT_EDITOR_REMOTE_PUBLISH_CONFIRMATION ||
  'Publish the current draft to your shared configuration service? Ensure tests and approvals are complete.';

export const AGENT_ROLE_OPTIONS: ReadonlyArray<{
  value: AgentRole;
  label: string;
}> = [
  { value: 'system', label: 'System' },
  { value: 'assistant', label: 'Assistant' },
  { value: 'user', label: 'User' },
  { value: 'tool', label: 'Tool' }
];

export const createDefaultInteraction = (
  overrides: Partial<
    Omit<AgentInteraction, 'id' | 'createdAt' | 'updatedAt'>
  > = {}
): Omit<AgentInteraction, 'id' | 'createdAt' | 'updatedAt'> => ({
  agentName: DEFAULT_AGENT_NAME,
  role: DEFAULT_AGENT_ROLE,
  summary: '',
  variables: [],
  content: '',
  ...overrides
});

export const isValidAgentRole = (value: string): value is AgentRole =>
  ROLE_VALUES.includes(value as AgentRole);
