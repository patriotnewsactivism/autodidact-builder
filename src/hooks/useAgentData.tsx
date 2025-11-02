import { useEffect, useState } from 'react';
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

export const useAgentData = (userId: string | undefined) => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState<Stats>({
    tasksCompleted: 0,
    linesChanged: 0,
    aiDecisions: 0,
    learningScore: 75,
    knowledgeNodes: 0,
    autonomyLevel: 92
  });
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;

    // Fetch initial data
    fetchActivities();
    fetchStats();

    // Subscribe to realtime updates
    const activitiesChannel = supabase
      .channel('activities-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `user_id=eq.${userId}`
        },
        () => fetchActivities()
      )
      .subscribe();

    const metricsChannel = supabase
      .channel('metrics-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_metrics',
          filter: `user_id=eq.${userId}`
        },
        () => fetchStats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(activitiesChannel);
      supabase.removeChannel(metricsChannel);
    };
  }, [userId]);

  const fetchActivities = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error fetching activities:', error);
      return;
    }

    setActivities(data.map(a => ({
      id: a.id,
      type: a.type,
      message: a.message,
      timestamp: new Date(a.created_at),
      status: a.status
    })));
  };

  const fetchStats = async () => {
    const { data: metrics, error: metricsError } = await supabase
      .from('agent_metrics')
      .select('*')
      .single();

    if (metricsError && metricsError.code !== 'PGRST116') {
      console.error('Error fetching metrics:', metricsError);
      return;
    }

    const { data: knowledgeCount, error: knowledgeError } = await supabase
      .from('knowledge_nodes')
      .select('id', { count: 'exact', head: true });

    if (metrics) {
      setStats({
        tasksCompleted: metrics.tasks_completed,
        linesChanged: metrics.lines_changed,
        aiDecisions: metrics.ai_decisions,
        learningScore: metrics.learning_score,
        knowledgeNodes: knowledgeCount?.length || 0,
        autonomyLevel: metrics.autonomy_level
      });
    }
  };

  const executeTask = async (instruction: string) => {
    try {
      // Create task
      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          user_id: userId,
          instruction: instruction,
          status: 'pending'
        })
        .select()
        .single();

      if (taskError) throw taskError;

      // Call edge function to process task
      const { error: funcError } = await supabase.functions.invoke('process-task', {
        body: { taskId: task.id }
      });

      if (funcError) {
        toast({
          title: 'Error',
          description: 'Failed to process task',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Error executing task:', error);
      toast({
        title: 'Error',
        description: 'Failed to create task',
        variant: 'destructive'
      });
    }
  };

  return { activities, stats, executeTask };
};