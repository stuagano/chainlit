import { cn } from '@/lib/utils';
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

import type { AgentInteraction } from '@/types/agentEditor';

interface InteractionListProps {
  interactions: AgentInteraction[];
  selectedId?: string;
  onSelect: (interactionId: string) => void;
  onAdd: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const formatRole = (role: string) => role[0].toUpperCase() + role.slice(1);

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
};

export const InteractionList = ({
  interactions,
  selectedId,
  onSelect,
  onAdd,
  onDuplicate,
  onDelete,
  onMoveUp,
  onMoveDown
}: InteractionListProps) => {
  const selectedIndex = useMemo(
    () =>
      interactions.findIndex((interaction) => interaction.id === selectedId),
    [interactions, selectedId]
  );

  const disableActions = interactions.length === 0 || selectedIndex === -1;
  const disableDelete = disableActions || interactions.length === 1;
  const disableMoveUp = disableActions || selectedIndex === 0;
  const disableMoveDown =
    disableActions || selectedIndex === interactions.length - 1;

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg font-semibold">
          Interaction Designer
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Arrange and maintain the agent turns your workflow will execute.
        </p>
        <TooltipProvider>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" onClick={onAdd} size="sm">
              <Plus className="size-4 mr-2" /> Add turn
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={onDuplicate}
                  disabled={disableActions}
                  aria-label="Duplicate selected turn"
                >
                  <Copy className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Duplicate</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={onDelete}
                  disabled={disableDelete}
                  aria-label="Delete selected turn"
                >
                  <Trash2 className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Delete</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={onMoveUp}
                  disabled={disableMoveUp}
                  aria-label="Move selected turn up"
                >
                  <ArrowUp className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move up</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={onMoveDown}
                  disabled={disableMoveDown}
                  aria-label="Move selected turn down"
                >
                  <ArrowDown className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Move down</TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="flex-1 min-h-0 p-0">
        <ScrollArea className="h-full">
          <div className="flex flex-col gap-2 p-4">
            {interactions.map((interaction, index) => {
              const isSelected = interaction.id === selectedId;
              return (
                <button
                  key={interaction.id}
                  type="button"
                  onClick={() => onSelect(interaction.id)}
                  className={cn(
                    'w-full rounded-md border p-3 text-left transition-colors',
                    'hover:border-primary/70 hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    isSelected
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-background'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">
                      {interaction.agentName || `Untitled turn ${index + 1}`}
                    </div>
                    <Badge variant={isSelected ? 'default' : 'outline'}>
                      {formatRole(interaction.role)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground truncate">
                    {interaction.summary || 'No summary provided'}
                  </p>
                  <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    Updated {formatTimestamp(interaction.updatedAt)}
                  </p>
                </button>
              );
            })}
            {interactions.length === 0 ? (
              <div className="text-sm text-muted-foreground italic">
                No interactions yet. Create your first turn to get started.
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
