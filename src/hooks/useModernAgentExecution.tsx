import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface FileChange {
  path: string;
  action: 'create' | 'update' | 'delete';
  linesAdded: number;
  linesRemoved: number;
  language: string;
  diff?: string;
  newContent?: string;
}

interface AgentRun {
  id: string;
  agentId: string;
  taskId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  filesChanged: number;
  linesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  startTime: Date;
  estimatedTimeRemaining?: number;
  estimatedCost: number;
  actualCost?: number;
  changes: any[];
}

export function useModernAgentExecution() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const { toast } = useToast();

  // Cost estimation constants (per 1K tokens)
  const COST_PER_1K_INPUT = 0.003; // $3 per 1M tokens = $0.003 per 1K
  const COST_PER_1K_OUTPUT = 0.015; // $15 per 1M tokens = $0.015 per 1K
  const AVG_TOKENS_PER_TASK = 8000; // Estimated average
  const AVG_TIME_PER_TASK = 120; // 2 minutes in seconds

  const estimateCost = useCallback((complexity: number = 1) => {
    const tokens = AVG_TOKENS_PER_TASK * complexity;
    const inputCost = (tokens * 0.6) / 1000 * COST_PER_1K_INPUT;
    const outputCost = (tokens * 0.4) / 1000 * COST_PER_1K_OUTPUT;
    return inputCost + outputCost;
  }, []);

  const estimateTime = useCallback((complexity: number = 1) => {
    return Math.ceil(AVG_TIME_PER_TASK * complexity);
  }, []);

  const executeTask = useCallback(async (
    instruction: string,
    agentCount: number,
    repoInfo?: { owner: string; name: string; branch: string },
    token?: string
  ) => {
    if (!instruction.trim()) return;

    setIsExecuting(true);

    try {
      const newRuns: AgentRun[] = [];

      // Create parallel agent runs
      for (let i = 0; i < agentCount; i++) {
        const runId = `agent-${Date.now()}-${i}`;
        const complexity = 0.8 + Math.random() * 0.4; // 0.8-1.2x

        const run: AgentRun = {
          id: runId,
          agentId: `Agent ${i + 1}`,
          taskId: '',
          status: 'running',
          progress: 0,
          currentStep: 'Initializing...',
          filesChanged: 0,
          linesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          startTime: new Date(),
          estimatedTimeRemaining: estimateTime(complexity),
          estimatedCost: estimateCost(complexity),
          changes: [],
        };

        newRuns.push(run);
      }

      setRuns(prev => [...prev, ...newRuns]);

      // Execute tasks in parallel using Bedrock backend
      const taskPromises = newRuns.map(async (run, index) => {
        try {
          // Update: Analyzing
          setRuns(prev => prev.map(r => 
            r.id === run.id 
              ? { ...r, progress: 20, currentStep: 'Analyzing codebase...' }
              : r
          ));

          // Call Bedrock edge function
          const { data, error } = await supabase.functions.invoke('bedrock-agent', {
            body: {
              instruction,
              repo: repoInfo,
              model: 'anthropic.claude-sonnet-4', // Use Claude Sonnet 4.5
              autoApply: false,
              token
            }
          });

          if (error) throw error;

          // Update: Planning
          setRuns(prev => prev.map(r => 
            r.id === run.id 
              ? { ...r, progress: 40, currentStep: 'Creating execution plan...' }
              : r
          ));

          await new Promise(resolve => setTimeout(resolve, 1000));

          // Update: Executing
          setRuns(prev => prev.map(r => 
            r.id === run.id 
              ? { ...r, progress: 60, currentStep: 'Generating code changes...' }
              : r
          ));

          // Process task via Bedrock
          const { data: taskData, error: taskError } = await supabase.functions.invoke('process-task-bedrock', {
            body: {
              taskId: data.taskId,
              token
            }
          });

          if (taskError) throw taskError;

          // Update: Completing
          setRuns(prev => prev.map(r => 
            r.id === run.id 
              ? { 
                  ...r, 
                  progress: 100, 
                  status: 'completed',
                  currentStep: 'Completed',
                  filesChanged: taskData.stats?.filesChanged || 0,
                  linesAdded: taskData.stats?.linesAdded || 0,
                  linesRemoved: taskData.stats?.linesRemoved || 0,
                  linesChanged: (taskData.stats?.linesAdded || 0) + (taskData.stats?.linesRemoved || 0),
                  actualCost: taskData.cost || run.estimatedCost,
                  estimatedTimeRemaining: 0,
                  changes: taskData.changes || []
                }
              : r
          ));

        } catch (error: any) {
          console.error(`Agent ${index + 1} error:`, error);
          setRuns(prev => prev.map(r => 
            r.id === run.id 
              ? { 
                  ...r, 
                  status: 'error',
                  currentStep: error.message || 'Failed',
                  estimatedTimeRemaining: 0
                }
              : r
          ));
        }
      });

      await Promise.all(taskPromises);

      toast({
        title: 'Tasks completed',
        description: `All ${agentCount} agents finished execution`
      });

    } catch (error: any) {
      console.error('Execution error:', error);
      toast({
        title: 'Execution failed',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setIsExecuting(false);
    }
  }, [estimateCost, estimateTime, toast]);

  const clearRuns = useCallback(() => {
    setRuns([]);
  }, []);

  return {
    runs,
    isExecuting,
    executeTask,
    clearRuns,
    estimateCost,
    estimateTime
  };
}
