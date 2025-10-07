import {
  AGENT_EDITOR_STORAGE_KEY,
  createDefaultInteraction,
  isValidAgentRole
} from '@/config/agentEditor';
import { v4 as uuidv4 } from 'uuid';

import type { AgentInteraction, AgentRole } from '@/types/agentEditor';

const normalizeVariables = (variables: unknown): string[] => {
  if (!Array.isArray(variables)) {
    return [];
  }

  const seen = new Set<string>();
  for (const value of variables) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    seen.add(trimmed);
  }
  return Array.from(seen);
};

export const sanitizeRichText = (value: string): string => {
  if (typeof window === 'undefined') {
    return value;
  }

  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(value, 'text/html');

    const disallowedTags = [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'link',
      'meta'
    ];

    disallowedTags.forEach((tag) => {
      parsed.querySelectorAll(tag).forEach((node) => node.remove());
    });

    const walker = parsed.createTreeWalker(
      parsed.body,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    while (walker.nextNode()) {
      const element = walker.currentNode as HTMLElement;
      for (const attr of Array.from(element.attributes)) {
        const attrName = attr.name.toLowerCase();
        const attrValue = attr.value.toLowerCase();

        if (attrName.startsWith('on')) {
          element.removeAttribute(attr.name);
          continue;
        }

        if (attrValue.includes('javascript:')) {
          element.removeAttribute(attr.name);
        }
      }
    }

    return parsed.body.innerHTML;
  } catch (error) {
    console.warn('Failed to sanitize rich text value', error);
    return value;
  }
};

export const createInteraction = (
  overrides: Partial<AgentInteraction> = {}
): AgentInteraction => {
  const now = new Date().toISOString();
  const base = createDefaultInteraction(overrides);

  const agentName = overrides.agentName?.trim() || base.agentName;
  const summary = overrides.summary?.trim() ?? base.summary;
  const role: AgentRole = overrides.role
    ? isValidAgentRole(overrides.role)
      ? overrides.role
      : base.role
    : base.role;
  const variables = normalizeVariables(overrides.variables ?? base.variables);
  const content = overrides.content ?? base.content;

  return {
    id: overrides.id || uuidv4(),
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    agentName,
    role,
    summary,
    variables,
    content
  };
};

export const deserializeInteractions = (value: unknown): AgentInteraction[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return createInteraction();
    }
    return createInteraction(entry as Partial<AgentInteraction>);
  });
};

export const loadDraftInteractions = (): AgentInteraction[] | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(AGENT_EDITOR_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    const interactions = deserializeInteractions(parsed);
    return interactions.length ? interactions : undefined;
  } catch (error) {
    console.warn('Failed to load saved agent interactions', error);
    return undefined;
  }
};

export const persistDraftInteractions = (
  interactions: AgentInteraction[]
): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AGENT_EDITOR_STORAGE_KEY,
      JSON.stringify(interactions)
    );
  } catch (error) {
    console.warn('Failed to persist agent interactions', error);
  }
};

export const stringifyInteractions = (
  interactions: AgentInteraction[]
): string => JSON.stringify(interactions, null, 2);
