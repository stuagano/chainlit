import { AGENT_EDITOR_ENABLED } from '@/config/agentEditor';
import { PenSquare } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';

const AgentEditorButton = () => {
  if (!AGENT_EDITOR_ENABLED) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link to="/agent-editor">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="text-muted-foreground hover:text-muted-foreground"
            >
              <PenSquare className="!size-4" />
            </Button>
          </Link>
        </TooltipTrigger>
        <TooltipContent>Agent editor</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AgentEditorButton;
