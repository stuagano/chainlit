import { cn } from '@/lib/utils';

import { Markdown } from '@/components/Markdown';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

import type { AgentInteraction } from '@/types/agentEditor';

interface InteractionPreviewProps {
  interactions: AgentInteraction[];
}

const formatRole = (role: string) => role[0].toUpperCase() + role.slice(1);

export const InteractionPreview = ({
  interactions
}: InteractionPreviewProps) => {
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg font-semibold">
          Conversation preview
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          This preview renders the scripted content as it will appear inside the
          Chainlit chat experience.
        </p>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-4 p-4">
            {interactions.map((interaction, index) => (
              <div
                key={interaction.id}
                className="rounded-lg border border-border bg-muted/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {interaction.agentName || `Turn ${index + 1}`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      #{index + 1} · {formatRole(interaction.role)} turn
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {formatRole(interaction.role)}
                  </Badge>
                </div>
                {interaction.summary ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {interaction.summary}
                  </p>
                ) : null}
                {interaction.variables.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {interaction.variables.map((variable) => (
                      <Badge
                        key={`${interaction.id}-${variable}`}
                        variant="outline"
                        className="text-[11px] uppercase tracking-wide"
                      >
                        {variable}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4">
                  {interaction.content ? (
                    <Markdown allowHtml className={cn('max-w-none text-sm')}>
                      {interaction.content}
                    </Markdown>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No scripted response provided for this turn.
                    </p>
                  )}
                </div>
              </div>
            ))}
            {interactions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Add turns to preview your scripted experience.
              </p>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
