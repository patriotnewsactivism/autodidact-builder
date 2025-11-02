-- Fix security issue by recreating function with search_path
DROP TRIGGER IF EXISTS on_task_completed ON public.tasks;
DROP FUNCTION IF EXISTS public.update_agent_metrics() CASCADE;

CREATE OR REPLACE FUNCTION public.update_agent_metrics()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
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
$$;

-- Recreate trigger
CREATE TRIGGER on_task_completed
  AFTER UPDATE ON public.tasks
  FOR EACH ROW
  WHEN (OLD.status != NEW.status)
  EXECUTE FUNCTION public.update_agent_metrics();