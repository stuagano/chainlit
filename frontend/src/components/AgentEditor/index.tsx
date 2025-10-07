import {
  AGENT_EDITOR_AUTOSAVE_DELAY_MS,
  AGENT_EDITOR_REMOTE_PUBLISH_CONFIRMATION,
  AGENT_EDITOR_REMOTE_PUBLISH_ENABLED,
  AGENT_EDITOR_STORAGE_KEY,
  AGENT_ROLE_OPTIONS,
  DEFAULT_AGENT_ROLE
} from '@/config/agentEditor';
import {
  createInteraction,
  deserializeInteractions,
  loadDraftInteractions,
  persistDraftInteractions,
  stringifyInteractions
} from '@/lib/agentEditor';
import {
  agentEditorServiceBaseUrl,
  fetchAgentInteractions,
  hasRemoteAgentEditorService,
  persistAgentInteractionsRemote
} from '@/lib/agentEditorService';
import {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { toast } from 'sonner';
import { useDebounce } from 'usehooks-ts';

import {
  IntegrationChecklist,
  type RemotePublishStatus,
  type RemoteSyncStatus
} from '@/components/AgentEditor/IntegrationChecklist';
import { InteractionList } from '@/components/AgentEditor/InteractionList';
import { InteractionPreview } from '@/components/AgentEditor/InteractionPreview';
import { RichTextEditor } from '@/components/AgentEditor/RichTextEditor';
import Alert from '@/components/Alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import type { AgentInteraction, AgentRole } from '@/types/agentEditor';

const arraysEqual = (a: string[], b: string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index]);

const formatTemporalLabel = (
  iso: string | null | undefined,
  emptyLabel: string,
  prefix: string
) => {
  if (!iso) return emptyLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return `${prefix} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`;
};

const parseVariables = (value: string): string[] => {
  const tokens = value
    .split(/\r?\n/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      const withoutPrefix = token.replace(/^\$\{?/, '');
      const withoutSuffix = withoutPrefix.replace(/\}?$/, '');
      return withoutSuffix.trim();
    })
    .filter(Boolean);
  return Array.from(new Set(tokens));
};

const computeLatestUpdatedAt = (items: AgentInteraction[]): string | null => {
  const timestamps = items
    .map((interaction) => Date.parse(interaction.updatedAt))
    .filter((value) => Number.isFinite(value)) as number[];

  if (!timestamps.length) {
    return null;
  }

  const latest = Math.max(...timestamps);
  return new Date(latest).toISOString();
};

export const AgentEditor = () => {
  const initialInteractions = useMemo<AgentInteraction[]>(() => {
    if (typeof window === 'undefined') {
      return [createInteraction()];
    }
    const stored = loadDraftInteractions();
    return stored && stored.length ? stored : [createInteraction()];
  }, []);

  const [interactions, setInteractions] =
    useState<AgentInteraction[]>(initialInteractions);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialInteractions[0]?.id
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [remoteSyncStatus, setRemoteSyncStatus] =
    useState<RemoteSyncStatus>('idle');
  const [remoteSyncError, setRemoteSyncError] = useState<string | null>(null);
  const [remotePublishStatus, setRemotePublishStatus] =
    useState<RemotePublishStatus>('idle');
  const [remotePublishError, setRemotePublishError] = useState<string | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const debouncedInteractions = useDebounce(
    interactions,
    AGENT_EDITOR_AUTOSAVE_DELAY_MS
  );

  const remoteServiceConfigured = hasRemoteAgentEditorService;
  const remotePublishConfigured =
    remoteServiceConfigured && AGENT_EDITOR_REMOTE_PUBLISH_ENABLED;

  useEffect(() => {
    if (!debouncedInteractions.length) return;
    persistDraftInteractions(debouncedInteractions);
    setLastSavedAt(new Date().toISOString());
  }, [debouncedInteractions]);

  useEffect(() => {
    if (!interactions.length) {
      const fresh = createInteraction();
      setInteractions([fresh]);
      setSelectedId(fresh.id);
      return;
    }
    if (!selectedId || !interactions.some((item) => item.id === selectedId)) {
      setSelectedId(interactions[0].id);
    }
  }, [interactions, selectedId]);

  useEffect(() => {
    if (!remoteServiceConfigured) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const hydrateFromRemote = async () => {
      setRemoteSyncStatus('loading');
      setRemoteSyncError(null);

      try {
        const remote = await fetchAgentInteractions(controller.signal);

        if (!remote || !remote.length) {
          if (!cancelled) {
            setRemoteSyncStatus('success');
            toast.info(
              'Shared configuration service returned no interactions. Draft locally and publish when ready.'
            );
          }
          return;
        }

        if (cancelled) {
          return;
        }

        setInteractions(remote);
        setSelectedId(remote[0].id);
        const latest =
          computeLatestUpdatedAt(remote) ?? new Date().toISOString();
        setLastSavedAt(latest);
        setLastPublishedAt(latest);
        setRemoteSyncStatus('success');
        toast.success(
          'Loaded interactions from the shared configuration service.'
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        console.error('Failed to fetch remote agent interactions', error);
        setRemoteSyncStatus('error');
        const message =
          error instanceof Error ? error.message : 'Unknown error occurred.';
        setRemoteSyncError(message);
        toast.error(
          'Failed to load remote interactions. Falling back to local drafts.'
        );
      }
    };

    hydrateFromRemote();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [remoteServiceConfigured, setInteractions]);

  const selectedInteraction = useMemo(
    () => interactions.find((interaction) => interaction.id === selectedId),
    [interactions, selectedId]
  );

  const savedStatusLabel = useMemo(
    () =>
      formatTemporalLabel(lastSavedAt, 'Draft not saved yet', 'Draft saved'),
    [lastSavedAt]
  );

  const publishedStatusLabel = useMemo(
    () =>
      formatTemporalLabel(
        lastPublishedAt,
        'No remote publish yet',
        'Published'
      ),
    [lastPublishedAt]
  );

  const updateInteraction = useCallback(
    (id: string, updates: Partial<AgentInteraction>) => {
      setInteractions((prev) =>
        prev.map((interaction) => {
          if (interaction.id !== id) {
            return interaction;
          }

          const nextVariables =
            updates.variables !== undefined
              ? updates.variables
              : interaction.variables;

          const variablesChanged =
            updates.variables !== undefined &&
            !arraysEqual(nextVariables, interaction.variables);

          const stringChanged =
            (updates.agentName !== undefined &&
              updates.agentName !== interaction.agentName) ||
            (updates.summary !== undefined &&
              updates.summary !== interaction.summary) ||
            (updates.role !== undefined && updates.role !== interaction.role) ||
            (updates.content !== undefined &&
              updates.content !== interaction.content);

          if (!stringChanged && !variablesChanged) {
            return interaction;
          }

          return {
            ...interaction,
            ...updates,
            variables: nextVariables,
            updatedAt: new Date().toISOString()
          };
        })
      );
    },
    []
  );

  const handleAdd = useCallback(() => {
    const interaction = createInteraction();
    setInteractions((prev) => [...prev, interaction]);
    setSelectedId(interaction.id);
    toast.success('Added a new interaction turn.');
  }, []);

  const handleDuplicate = useCallback(() => {
    if (!selectedId) {
      toast.error('Select a turn before duplicating.');
      return;
    }

    const index = interactions.findIndex((item) => item.id === selectedId);
    if (index === -1) {
      toast.error('The selected turn no longer exists.');
      return;
    }
    const source = interactions[index];
    const duplicate = createInteraction({
      agentName: `${source.agentName} (copy)`,
      role: source.role,
      summary: source.summary,
      variables: source.variables,
      content: source.content
    });

    const next = [...interactions];
    next.splice(index + 1, 0, duplicate);
    setInteractions(next);
    setSelectedId(duplicate.id);
    toast.success('Duplicated interaction.');
  }, [interactions, selectedId]);

  const handleDelete = useCallback(() => {
    if (!selectedId) {
      toast.error('Select a turn before deleting.');
      return;
    }

    if (interactions.length <= 1) {
      toast.error('At least one turn must remain in the workspace.');
      return;
    }

    const index = interactions.findIndex((item) => item.id === selectedId);
    if (index === -1) {
      toast.error('The selected turn no longer exists.');
      return;
    }

    const next = [...interactions];
    next.splice(index, 1);
    const fallback = next[index - 1]?.id ?? next[index]?.id ?? next[0]?.id;
    setInteractions(next);
    setSelectedId(fallback);
    toast.success('Removed interaction turn.');
  }, [interactions, selectedId]);

  const handleMove = useCallback(
    (direction: 'up' | 'down') => {
      if (!selectedId) {
        toast.error('Select a turn before reordering.');
        return;
      }
      const index = interactions.findIndex((item) => item.id === selectedId);
      if (index === -1) {
        toast.error('The selected turn no longer exists.');
        return;
      }
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= interactions.length) {
        return;
      }
      const next = [...interactions];
      const [removed] = next.splice(index, 1);
      next.splice(targetIndex, 0, removed);
      setInteractions(next);
      toast.success('Reordered interaction.');
    },
    [interactions, selectedId]
  );

  const handleVariablesChange = useCallback(
    (value: string) => {
      if (!selectedInteraction) return;
      const parsed = parseVariables(value);
      updateInteraction(selectedInteraction.id, { variables: parsed });
    },
    [selectedInteraction, updateInteraction]
  );

  const handleContentChange = useCallback(
    (value: string) => {
      if (!selectedInteraction) return;
      updateInteraction(selectedInteraction.id, { content: value });
    },
    [selectedInteraction, updateInteraction]
  );

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);
        const imported = deserializeInteractions(parsed);
        if (!imported.length) {
          toast.error('The selected file did not contain any interactions.');
          return;
        }
        setInteractions(imported);
        setSelectedId(imported[0].id);
        toast.success(
          `Imported ${imported.length} turn${imported.length > 1 ? 's' : ''}.`
        );
      } catch (error) {
        console.error('Failed to import interactions', error);
        toast.error(
          'Failed to import configuration. Ensure the JSON is valid.'
        );
      } finally {
        event.target.value = '';
      }
    },
    []
  );

  const handleExport = useCallback(async () => {
    if (!interactions.length) {
      toast.error('Add a turn before exporting.');
      return;
    }
    const payload = stringifyInteractions(interactions);
    let copied = false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        copied = true;
      }
    } catch (error) {
      console.warn('Clipboard export failed', error);
    }

    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `agent-interactions-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success(
      copied
        ? 'Exported JSON and copied to clipboard.'
        : 'Exported JSON. Download started.'
    );
  }, [interactions]);

  const handleReset = useCallback(() => {
    if (typeof window !== 'undefined') {
      const confirmReset = window.confirm(
        'This will remove all drafted turns from local storage. Continue?'
      );
      if (!confirmReset) {
        return;
      }
    }
    const fresh = createInteraction();
    setInteractions([fresh]);
    setSelectedId(fresh.id);
    setLastSavedAt(null);
    toast.success('Workspace reset.');
  }, []);

  const handlePublishRemote = useCallback(async () => {
    if (!remotePublishConfigured) {
      toast.error(
        'Configure VITE_AGENT_EDITOR_API_BASE_URL and enable VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED before publishing.'
      );
      return;
    }

    if (!interactions.length) {
      toast.error('Add a turn before publishing.');
      return;
    }

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        AGENT_EDITOR_REMOTE_PUBLISH_CONFIRMATION
      );
      if (!confirmed) {
        return;
      }
    }

    setRemotePublishStatus('loading');
    setRemotePublishError(null);

    try {
      await persistAgentInteractionsRemote(interactions);
      const timestamp = new Date().toISOString();
      setRemotePublishStatus('success');
      setLastPublishedAt(timestamp);
      setLastSavedAt((current) => current ?? timestamp);
      toast.success(
        'Published interactions to the shared configuration service.'
      );
    } catch (error) {
      console.error('Failed to publish agent interactions remotely', error);
      setRemotePublishStatus('error');
      const message =
        error instanceof Error ? error.message : 'Unknown error occurred.';
      setRemotePublishError(message);
      toast.error('Failed to publish remote interactions. Review the logs.');
    }
  }, [
    interactions,
    remotePublishConfigured,
    setLastSavedAt,
    setLastPublishedAt
  ]);

  useEffect(() => {
    if (!remotePublishConfigured) {
      setRemotePublishStatus('idle');
      setRemotePublishError(null);
    }
  }, [remotePublishConfigured]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-foreground">
            Agent Interaction Studio
          </h1>
          <p className="text-sm text-muted-foreground">
            Design, document, and QA scripted agent turns before promoting them
            to your shared configuration service or deploying to Cloud Run.
          </p>
        </div>

        <Alert>
          Keep runtime credentials in Secret Manager, persist approved
          interactions in a central datastore (such as Firestore or Cloud SQL),
          and deliver updates through your CI/CD pipeline. This editor only
          holds local drafts for rapid prototyping.
        </Alert>

        <IntegrationChecklist
          autosaveKey={AGENT_EDITOR_STORAGE_KEY}
          lastSavedLabel={savedStatusLabel}
          lastPublishedLabel={publishedStatusLabel}
          remotePublishConfigured={remotePublishConfigured}
          remoteServiceConfigured={remoteServiceConfigured}
          remoteSyncError={remoteSyncError}
          remoteSyncStatus={remoteSyncStatus}
          remotePublishError={remotePublishError}
          remotePublishStatus={remotePublishStatus}
          serviceBaseUrl={agentEditorServiceBaseUrl}
        />

        <div className="grid flex-1 grid-rows-1 gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
          <InteractionList
            interactions={interactions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onAdd={handleAdd}
            onDuplicate={handleDuplicate}
            onDelete={handleDelete}
            onMoveUp={() => handleMove('up')}
            onMoveDown={() => handleMove('down')}
          />

          <div className="flex min-h-0 flex-col gap-6">
            <Card className="flex h-full flex-col">
              <CardHeader className="space-y-1">
                <CardTitle className="text-lg font-semibold">
                  Interaction details
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Provide metadata and scripted guidance for the selected turn.
                </p>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="agent-name">Agent name</Label>
                    <Input
                      id="agent-name"
                      value={selectedInteraction?.agentName ?? ''}
                      onChange={(event) =>
                        selectedInteraction &&
                        updateInteraction(selectedInteraction.id, {
                          agentName: event.target.value
                        })
                      }
                      placeholder="e.g. Vertex Response Specialist"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="agent-role">Role</Label>
                    <Select
                      value={selectedInteraction?.role ?? DEFAULT_AGENT_ROLE}
                      onValueChange={(value) =>
                        selectedInteraction &&
                        updateInteraction(selectedInteraction.id, {
                          role: value as AgentRole
                        })
                      }
                    >
                      <SelectTrigger id="agent-role">
                        <SelectValue placeholder="Select a role" />
                      </SelectTrigger>
                      <SelectContent>
                        {AGENT_ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="agent-summary">Summary</Label>
                    <Input
                      id="agent-summary"
                      value={selectedInteraction?.summary ?? ''}
                      onChange={(event) =>
                        selectedInteraction &&
                        updateInteraction(selectedInteraction.id, {
                          summary: event.target.value
                        })
                      }
                      placeholder="One-line description for reviewers"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="agent-variables">Runtime variables</Label>
                    <Textarea
                      id="agent-variables"
                      value={(selectedInteraction?.variables || []).join('\n')}
                      onChange={(event) =>
                        handleVariablesChange(event.target.value)
                      }
                      placeholder={['PROJECT_ID', 'DATASET_ID'].join('\n')}
                      rows={4}
                    />
                    <p className="text-xs text-muted-foreground">
                      Define placeholders resolved by your backend (one per
                      line). Keep names aligned with shared configuration and
                      secrets stored in GCP.
                    </p>
                  </div>
                </div>
                <div className="space-y-2 flex-1 min-h-[280px]">
                  <Label>Scripted response</Label>
                  <RichTextEditor
                    value={selectedInteraction?.content ?? ''}
                    onChange={handleContentChange}
                    placeholder="Author the assistant message, escalate rules, or evaluation notes here."
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleImportClick}
                  >
                    Import JSON
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleExport}
                  >
                    Export JSON
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePublishRemote}
                    disabled={
                      !remotePublishConfigured ||
                      remotePublishStatus === 'loading'
                    }
                  >
                    {remotePublishStatus === 'loading'
                      ? 'Publishing…'
                      : 'Publish to remote service'}
                  </Button>
                  <Button type="button" variant="ghost" onClick={handleReset}>
                    Reset workspace
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleImportFile}
                />
              </CardContent>
            </Card>

            <InteractionPreview interactions={interactions} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentEditor;
