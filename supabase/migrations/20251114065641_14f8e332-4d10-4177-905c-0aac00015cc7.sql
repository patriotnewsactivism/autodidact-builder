-- Upgrade codebase_embeddings table to support vector similarity search
ALTER TABLE codebase_embeddings 
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Create an index for fast vector similarity search
CREATE INDEX IF NOT EXISTS codebase_embeddings_embedding_idx 
ON codebase_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create a function for semantic code search
CREATE OR REPLACE FUNCTION search_codebase_semantic(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  target_repo text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  file_path text,
  chunk_text text,
  start_line int,
  end_line int,
  repo_owner text,
  repo_name text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ce.id,
    ce.file_path,
    ce.chunk_text,
    ce.start_line,
    ce.end_line,
    ce.repo_owner,
    ce.repo_name,
    1 - (ce.embedding <=> query_embedding) as similarity
  FROM codebase_embeddings ce
  WHERE 
    (target_repo IS NULL OR ce.repo_name = target_repo)
    AND ce.embedding IS NOT NULL
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create conflict resolution tasks table
CREATE TABLE IF NOT EXISTS conflict_resolution_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  branch text NOT NULL,
  conflicting_files jsonb NOT NULL,
  diff_content text NOT NULL,
  resolution_status text NOT NULL DEFAULT 'pending',
  resolved_content jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  error_message text
);

-- Enable RLS on conflict_resolution_tasks
ALTER TABLE conflict_resolution_tasks ENABLE ROW LEVEL SECURITY;

-- Create policies for conflict_resolution_tasks
CREATE POLICY "Users can view their own conflict tasks"
ON conflict_resolution_tasks FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conflict tasks"
ON conflict_resolution_tasks FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conflict tasks"
ON conflict_resolution_tasks FOR UPDATE
USING (auth.uid() = user_id);

-- Create code quality issues table for self-healing
CREATE TABLE IF NOT EXISTS code_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  issue_type text NOT NULL, -- 'typescript', 'eslint', 'strictNullChecks', etc.
  severity text NOT NULL, -- 'error', 'warning', 'info'
  line_number int,
  column_number int,
  message text NOT NULL,
  rule_name text,
  auto_fix_attempted boolean DEFAULT false,
  fixed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb
);

-- Enable RLS on code_quality_issues
ALTER TABLE code_quality_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quality issues"
ON code_quality_issues FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own quality issues"
ON code_quality_issues FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own quality issues"
ON code_quality_issues FOR UPDATE
USING (auth.uid() = user_id);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS conflict_resolution_tasks_user_id_idx ON conflict_resolution_tasks(user_id);
CREATE INDEX IF NOT EXISTS conflict_resolution_tasks_status_idx ON conflict_resolution_tasks(resolution_status);
CREATE INDEX IF NOT EXISTS code_quality_issues_user_id_idx ON code_quality_issues(user_id);
CREATE INDEX IF NOT EXISTS code_quality_issues_file_path_idx ON code_quality_issues(file_path);
CREATE INDEX IF NOT EXISTS code_quality_issues_fixed_idx ON code_quality_issues(fixed_at) WHERE fixed_at IS NULL;