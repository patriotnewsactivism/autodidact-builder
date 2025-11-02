-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  result TEXT,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create activities table
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- ai, code, file, success, error, warning
  message TEXT NOT NULL,
  status TEXT NOT NULL, -- progress, success, error, warning
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create agent_metrics table
CREATE TABLE public.agent_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tasks_completed INTEGER DEFAULT 0,
  lines_changed INTEGER DEFAULT 0,
  ai_decisions INTEGER DEFAULT 0,
  learning_score INTEGER DEFAULT 75,
  knowledge_nodes INTEGER DEFAULT 0,
  autonomy_level INTEGER DEFAULT 92,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create knowledge_nodes table
CREATE TABLE public.knowledge_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT,
  confidence_score INTEGER DEFAULT 50,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_nodes ENABLE ROW LEVEL SECURITY;

-- Tasks policies
CREATE POLICY "Users can view own tasks"
  ON public.tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks"
  ON public.tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON public.tasks FOR UPDATE
  USING (auth.uid() = user_id);

-- Activities policies
CREATE POLICY "Users can view own activities"
  ON public.activities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own activities"
  ON public.activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Metrics policies
CREATE POLICY "Users can view own metrics"
  ON public.agent_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own metrics"
  ON public.agent_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metrics"
  ON public.agent_metrics FOR UPDATE
  USING (auth.uid() = user_id);

-- Knowledge policies
CREATE POLICY "Users can view own knowledge"
  ON public.knowledge_nodes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own knowledge"
  ON public.knowledge_nodes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own knowledge"
  ON public.knowledge_nodes FOR UPDATE
  USING (auth.uid() = user_id);

-- Create indexes
CREATE INDEX idx_tasks_user_id ON public.tasks(user_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_activities_user_id ON public.activities(user_id);
CREATE INDEX idx_activities_task_id ON public.activities(task_id);
CREATE INDEX idx_metrics_user_id ON public.agent_metrics(user_id);
CREATE INDEX idx_knowledge_user_id ON public.knowledge_nodes(user_id);

-- Function to update metrics
CREATE OR REPLACE FUNCTION public.update_agent_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    INSERT INTO public.agent_metrics (user_id, tasks_completed, ai_decisions)
    VALUES (NEW.user_id, 1, floor(random() * 5 + 1))
    ON CONFLICT (user_id) DO UPDATE
    SET 
      tasks_completed = agent_metrics.tasks_completed + 1,
      ai_decisions = agent_metrics.ai_decisions + floor(random() * 5 + 1),
      learning_score = LEAST(100, agent_metrics.learning_score + 1),
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-update metrics
CREATE TRIGGER on_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status != NEW.status)
  EXECUTE FUNCTION public.update_agent_metrics();

-- Add unique constraint for metrics
ALTER TABLE public.agent_metrics ADD CONSTRAINT unique_user_metrics UNIQUE (user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_metrics;