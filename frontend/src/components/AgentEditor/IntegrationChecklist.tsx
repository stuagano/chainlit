import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type RemoteSyncStatus = 'idle' | 'loading' | 'success' | 'error';

export type RemotePublishStatus = RemoteSyncStatus;

interface IntegrationChecklistProps {
  autosaveKey: string;
  lastSavedLabel: string;
  lastPublishedLabel: string;
  remotePublishConfigured: boolean;
  remoteServiceConfigured: boolean;
  remoteSyncError: string | null;
  remoteSyncStatus: RemoteSyncStatus;
  remotePublishError: string | null;
  remotePublishStatus: RemotePublishStatus;
  serviceBaseUrl?: string | null;
}

const statusLabels: Record<RemoteSyncStatus, string> = {
  idle: 'Not yet attempted',
  loading: 'Loading…',
  success: 'Synced',
  error: 'Error'
};

const statusVariants: Record<
  RemoteSyncStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  idle: 'secondary',
  loading: 'secondary',
  success: 'default',
  error: 'destructive'
};

export const IntegrationChecklist = ({
  autosaveKey,
  lastSavedLabel,
  lastPublishedLabel,
  remotePublishConfigured,
  remoteServiceConfigured,
  remoteSyncError,
  remoteSyncStatus,
  remotePublishError,
  remotePublishStatus,
  serviceBaseUrl
}: IntegrationChecklistProps) => {
  const badgeVariant = remoteServiceConfigured
    ? statusVariants[remoteSyncStatus]
    : 'outline';

  const badgeLabel = remoteServiceConfigured
    ? statusLabels[remoteSyncStatus]
    : 'Not configured';

  const publishBadgeVariant = remotePublishConfigured
    ? statusVariants[remotePublishStatus]
    : 'outline';

  const publishBadgeLabel = remotePublishConfigured
    ? statusLabels[remotePublishStatus]
    : 'Disabled';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          Integration checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="space-y-1 text-sm">
          <p className="font-medium text-foreground">{lastSavedLabel}</p>
          <p className="text-xs">
            Drafts persist locally under{' '}
            <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
              {autosaveKey}
            </code>
            . Promote reviewed versions via a shared service—do not treat
            browser storage as source of truth.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground">Remote config service</span>
            <Badge variant={badgeVariant}>{badgeLabel}</Badge>
          </div>
          {remoteServiceConfigured ? (
            <p className="text-xs">
              Hydrating from{' '}
              <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
                {serviceBaseUrl}
              </code>
              . Use IAM + HTTPS (e.g., Cloud Run behind IAP) so every
              environment references the same canonical definitions.
            </p>
          ) : (
            <p className="text-xs">
              Set{' '}
              <code className="rounded bg-muted px-2 py-1 font-mono text-[11px]">
                VITE_AGENT_EDITOR_API_BASE_URL
              </code>{' '}
              to a shared configuration endpoint (Firestore, Cloud SQL, or
              Config Connector) before enabling deployments.
            </p>
          )}
          {remoteSyncError ? (
            <p className="text-xs text-destructive">{remoteSyncError}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-foreground">Last publish</span>
            <Badge variant={publishBadgeVariant}>{publishBadgeLabel}</Badge>
          </div>
          <p className="text-xs">
            {lastPublishedLabel}. Gate this action through CI/CD and require
            approvals so Cloud Run, Cloud Functions, or batch jobs consume the
            same reviewed prompt contracts.
            {!remotePublishConfigured
              ? ' Enable remote publishing via VITE_AGENT_EDITOR_REMOTE_PUBLISH_ENABLED once guardrails are ready.'
              : ''}
          </p>
          {remotePublishError ? (
            <p className="text-xs text-destructive">{remotePublishError}</p>
          ) : null}
        </div>

        <ul className="list-disc space-y-2 pl-5 text-xs">
          <li>
            Enforce server-side validation + versioning in your config service
            to keep prompts, tools, and secrets DRY across teams.
          </li>
          <li>
            Automate promotion with Cloud Build/Deploy so approved drafts roll
            to Cloud Run using immutable image digests and environment overlays.
          </li>
          <li>
            Add test coverage (Vitest, integration smoke tests) and wire Cloud
            Logging/Monitoring alerts before handing access to operators.
          </li>
        </ul>
      </CardContent>
    </Card>
  );
};
