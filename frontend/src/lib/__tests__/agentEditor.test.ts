import { createInteraction, sanitizeRichText } from '@/lib/agentEditor';
import { describe, expect, it } from 'vitest';

import type { AgentRole } from '@/types/agentEditor';

describe('sanitizeRichText', () => {
  it('strips disallowed tags and inline event handlers', () => {
    const raw = `
      <div onclick="alert('xss')">
        <script>alert('bad')</script>
        <a href="javascript:evil()">Link</a>
        <p>Allowed content</p>
      </div>
    `;

    const sanitized = sanitizeRichText(raw);

    expect(sanitized).toContain('<div>');
    expect(sanitized).toContain('<p>Allowed content</p>');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('javascript:evil');
  });
});

describe('createInteraction', () => {
  it('normalizes strings and deduplicates variables', () => {
    const role: AgentRole = 'tool';
    const interaction = createInteraction({
      agentName: '  Demo Agent  ',
      summary: '  Summary copy  ',
      variables: ['FOO', 'foo', ' ', 'bar', 'FOO'],
      role,
      content: '<p>Body</p>'
    });

    expect(interaction.agentName).toBe('Demo Agent');
    expect(interaction.summary).toBe('Summary copy');
    expect(interaction.role).toBe('tool');
    expect(interaction.variables).toEqual(['FOO', 'foo', 'bar']);
    expect(new Date(interaction.createdAt).toString()).not.toBe('Invalid Date');
    expect(new Date(interaction.updatedAt).toString()).not.toBe('Invalid Date');
  });
});
