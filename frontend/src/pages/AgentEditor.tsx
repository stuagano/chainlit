import { AGENT_EDITOR_ENABLED } from '@/config/agentEditor';

import Page from 'pages/Page';

import AgentEditor from '@/components/AgentEditor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DisabledNotice = () => (
  <div className="flex flex-1 items-center justify-center p-6">
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">
          Agent editor disabled
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          The WYSIWYG agent editor is disabled for this deployment. Enable it by
          setting
          <code className="mx-1 rounded bg-muted px-2 py-[2px] font-mono text-xs">
            VITE_AGENT_EDITOR_ENABLED=true
          </code>
          in your frontend environment configuration.
        </p>
        <p>
          Remember to source environment variables from a shared configuration
          system so Cloud Run, Cloud Build, and local developers resolve the
          same values.
        </p>
        <p>
          Optionally set
          <code className="mx-1 rounded bg-muted px-2 py-[2px] font-mono text-xs">
            VITE_AGENT_EDITOR_API_BASE_URL
          </code>
          to hydrate drafts from your configuration service instead of relying
          on browser storage.
        </p>
      </CardContent>
    </Card>
  </div>
);

const AgentEditorPage = () => {
  return (
    <Page>{AGENT_EDITOR_ENABLED ? <AgentEditor /> : <DisabledNotice />}</Page>
  );
};

export default AgentEditorPage;
