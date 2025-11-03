-- Enable pgvector extension for vector embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create conversation_memory table for RAG and learning
CREATE TABLE IF NOT EXISTS public.conversation_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create codebase_embeddings table for RAG (without vector initially)
CREATE TABLE IF NOT EXISTS public.codebase_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  repo_full_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  content_chunk TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  language TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create agent_performance_metrics table for monitoring
CREATE TABLE IF NOT EXISTS public.agent_performance_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5, 2) DEFAULT 100.00,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_memory_user_id ON public.conversation_memory(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_memory_task_id ON public.conversation_memory(task_id);
CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_user_id ON public.codebase_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_repo ON public.codebase_embeddings(repo_full_name, branch);
CREATE INDEX IF NOT EXISTS idx_codebase_embeddings_file ON public.codebase_embeddings(file_path);
CREATE INDEX IF NOT EXISTS idx_agent_performance_user_id ON public.agent_performance_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_performance_task_id ON public.agent_performance_metrics(task_id);

-- Enable RLS
ALTER TABLE public.conversation_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.codebase_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for conversation_memory
CREATE POLICY "Users can view own conversation memory"
  ON public.conversation_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversation memory"
  ON public.conversation_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversation memory"
  ON public.conversation_memory FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies for codebase_embeddings
CREATE POLICY "Users can view own codebase embeddings"
  ON public.codebase_embeddings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own codebase embeddings"
  ON public.codebase_embeddings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own codebase embeddings"
  ON public.codebase_embeddings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own codebase embeddings"
  ON public.codebase_embeddings FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for agent_performance_metrics
CREATE POLICY "Users can view own performance metrics"
  ON public.agent_performance_metrics FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own performance metrics"
  ON public.agent_performance_metrics FOR INSERT
  WITH CHECK (auth.uid() = user_id);