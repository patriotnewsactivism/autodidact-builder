import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
  status: string;
}

interface Stats {
  tasksCompleted: number;
  linesChanged: number;
  aiDecisions: number;
  learningScore: number;
  knowledgeNodes: number;
  autonomyLevel: number;
}

interface AutoApplyResult {
  attempted: boolean;
  success: boolean;
  commitSha?: string;
  error?: string;
  filesChanged?: string[];
}

interface AgentTaskFileContext {
  path: string;
  content: string;
  sha?: string | null;
}

interface AgentTaskMetadata {
  repo?: {
    owner: string;
    name: string;
    branch: string;
  };
  files?: AgentTaskFileContext[];
  additionalContext?: string;
  autoApply?: boolean;
  plan?: unknown;
  generatedChanges?: unknown;
  stats?: {
    linesChanged?: number;
  };
  autoApplyResult?: AutoApplyResult;
  [key: string]: unknown;
}

interface AgentTask {
  id: string;
  instruction: string;
  status: string;
  result?: string | null;
  errorMessage?: string | null;
  metadata: AgentTaskMetadata;
  startedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
}

interface AgentTaskRow {
  id: string;
  instruction: string;
  status: string;
  result?: string | null;
  error_message?: string | null;
  metadata?: AgentTaskMetadata | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
}

interface ExecuteTaskOptions {
  repo?: {
    owner: string;
    name: string;
    branch: string;
  };
  files?: AgentTaskFileContext[];
  token?: string;
  additionalContext?: string;
  autoApply?: boolean;
}

export const useAgentData = (userId: string | undefined) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<Stats>({
    tasksCompleted: 0,
    linesChanged: 0,
    aiDecisions: 0,
    learningScore: 75,
    knowledgeNodes: 0,
    autonomyLevel: 92,
  });
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [isExecutingTask, setIsExecutingTask] = useState(false);
  const { toast } = useToast();
  const mapTaskRow = useCallback((row: AgentTaskRow): AgentTask => {
    return {
      id: row.id,
      instruction: row.instruction,
      status: row.status,
      result: row.result ?? null,
      errorMessage: row.error_message ?? null,
      metadata: (row.metadata ?? {}) as AgentTaskMetadata,
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
    };
  }, []);

  const fetchActivities = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching activities:', error);
      return;
    }

    setActivities(
      (data ?? []).map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        timestamp: new Date(a.created_at),
        status: a.status,
      }))
    );
  }, [userId]);

  const fetchStats = useCallback(async () => {
    if (!userId) return;
    const { data: metrics, error: metricsError } = await supabase
      .from('agent_metrics')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (metricsError && metricsError.code !== 'PGRST116') {
      console.error('Error fetching metrics:', metricsError);
      return;
    }

    const { count: knowledgeCount, error: knowledgeError } = await supabase
      .from('knowledge_nodes')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (knowledgeError && knowledgeError.code !== 'PGRST116') {
      console.error('Error fetching knowledge count:', knowledgeError);
    }

    if (metrics) {
      setStats({
        tasksCompleted: metrics.tasks_completed,
        linesChanged: metrics.lines_changed,
        aiDecisions: metrics.ai_decisions,
        learningScore: metrics.learning_score,
        knowledgeNodes: knowledgeCount ?? 0,
        autonomyLevel: metrics.autonomy_level,
      });
    }
  }, [userId]);

  const fetchTasks = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error fetching tasks:', error);
      return;
    }

    setTasks((data ?? []).map(mapTaskRow));
  }, [mapTaskRow, userId]);

  const executeTask = useCallback(
    async (instruction: string, options?: ExecuteTaskOptions) => {
      if (!userId) {
        toast({
          title: 'Authentication required',
          description: 'Sign in to run autonomous agent tasks.',
          variant: 'destructive',
        });
        return null;
      }

      setIsExecutingTask(true);

      try {
        const metadata: AgentTaskMetadata = {};
        if (options?.repo) {
          metadata.repo = options.repo;
        }
        if (options?.files) {
          metadata.files = options.files.map((file) => ({
            path: file.path,
            content: file.content,
            sha: file.sha ?? null,
          }));
        }
        if (options?.additionalContext) {
          metadata.additionalContext = options.additionalContext;
        }
        if (typeof options?.autoApply === 'boolean') {
          metadata.autoApply = options.autoApply;
        }

        const { data: rows, error: taskError } = await supabase
          .from('tasks')
          .insert({
            user_id: userId,
            instruction,
            status: 'pending',
            metadata,
          })
          .select()
          .single();

        if (taskError) throw taskError;

        const taskRecord = mapTaskRow(rows);
        setTasks((prev) => [taskRecord, ...prev.filter((task) => task.id !== taskRecord.id)]);

        const headers: Record<string, string> = {};
        if (options?.token) {
          headers['x-github-token'] = options.token;
        }

        const { error: funcError } = await supabase.functions.invoke('process-task', {
          body: { taskId: taskRecord.id },
          headers,
        });

        if (funcError) {
          toast({
            title: 'Agent error',
            description: 'Failed to process task request.',
            variant: 'destructive',
          });
        }

        return taskRecord;
      } catch (error) {
        console.error('Error executing task:', error);
        toast({
          title: 'Agent error',
          description: 'Unable to create task.',
          variant: 'destructive',
        });
        return null;
      } finally {
        setIsExecutingTask(false);
      }
    },
    [mapTaskRow, toast, userId]
  );

  const refreshAgentData = useCallback(() => {
    fetchActivities();
    fetchStats();
    fetchTasks();
  }, [fetchActivities, fetchStats, fetchTasks]);

  useEffect(() => {
    if (!userId) return;

    fetchActivities();
    fetchStats();
    fetchTasks();

    const activitiesChannel = supabase
      .channel(`activities-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `user_id=eq.${userId}`,
        },
        fetchActivities
      )
      .subscribe();

    const metricsChannel = supabase
      .channel(`metrics-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_metrics',
          filter: `user_id=eq.${userId}`,
        },
        fetchStats
      )
      .subscribe();

    const tasksChannel = supabase
      .channel(`tasks-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: `user_id=eq.${userId}`,
        },
        fetchTasks
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
      supabase.removeChannel(metricsChannel);
      supabase.removeChannel(tasksChannel);
    };
  }, [fetchActivities, fetchStats, fetchTasks, userId]);

  return {
    activities,
    stats,
    tasks,
    executeTask,
    isExecutingTask,
    refreshAgentData,
  };
};
