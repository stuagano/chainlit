import { AGENT_EDITOR_API_BASE_URL } from '@/config/agentEditor';
import {
  deserializeInteractions,
  stringifyInteractions
} from '@/lib/agentEditor';

import type { AgentInteraction } from '@/types/agentEditor';

const baseUrl = AGENT_EDITOR_API_BASE_URL;

const ensureBaseUrl = (): string => {
  if (!baseUrl) {
    throw new Error('AGENT_EDITOR_API_BASE_URL is not configured.');
  }
  return baseUrl;
};

const buildUrl = (path: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${ensureBaseUrl()}${normalizedPath}`;
};

export const agentEditorServiceBaseUrl = baseUrl;

export const hasRemoteAgentEditorService = Boolean(baseUrl);

export const fetchAgentInteractions = async (
  signal?: AbortSignal
): Promise<AgentInteraction[] | undefined> => {
  if (!baseUrl) {
    return undefined;
  }

  const response = await fetch(buildUrl('/agent-interactions'), {
    method: 'GET',
    credentials: 'include',
    signal
  });

  if (response.status === 204) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch agent interactions. Received ${response.status}.`
    );
  }

  const payload = await response.json();
  const interactions = deserializeInteractions(payload);
  return interactions.length ? interactions : undefined;
};

export const persistAgentInteractionsRemote = async (
  interactions: AgentInteraction[],
  signal?: AbortSignal
): Promise<void> => {
  const url = buildUrl('/agent-interactions');

  const response = await fetch(url, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json'
    },
    body: stringifyInteractions(interactions),
    signal
  });

  if (!response.ok) {
    throw new Error(
      `Failed to persist agent interactions. Received ${response.status}.`
    );
  }
};
