export type AgentChangeAction = 'update' | 'create' | 'delete';

export interface AgentGeneratedChange {
  path: string;
  action: AgentChangeAction;
  description?: string;
  language?: string;
  diff?: string;
  newContent?: string;
  new_content?: string;
  summary?: string;
  lineDelta?: number;
  previousContent?: string;
  stepId?: string;
  stepTitle?: string;
  linesAdded?: number;
  linesRemoved?: number;
  metadata?: Record<string, unknown>;
}

