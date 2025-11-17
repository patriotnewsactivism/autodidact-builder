-- Migration: GitHub OAuth and Autonomous Building Support
-- This migration adds support for GitHub OAuth, webhooks, and autonomous repository monitoring

-- Table: github_installations
-- Stores GitHub OAuth tokens and repository access information
CREATE TABLE IF NOT EXISTS github_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  github_user_id bigint NOT NULL,
  github_username text NOT NULL,
  access_token text NOT NULL, -- OAuth token (encrypted at app level)
  token_type text DEFAULT 'oauth',
  scope text, -- OAuth scopes granted
  expires_at timestamptz,
  refresh_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, github_user_id)
);

-- Table: registered_repositories
-- Repositories that users want AutoDidact to monitor and improve
CREATE TABLE IF NOT EXISTS registered_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  installation_id uuid REFERENCES github_installations(id) ON DELETE CASCADE,
  repo_owner text NOT NULL,
  repo_name text NOT NULL,
  full_name text NOT NULL, -- owner/name
  default_branch text NOT NULL DEFAULT 'main',

  -- Autonomy settings
  auto_apply_enabled boolean DEFAULT false,
  auto_fix_todos boolean DEFAULT true,
  auto_fix_quality_issues boolean DEFAULT true,
  auto_respond_to_issues boolean DEFAULT false,
  auto_review_prs boolean DEFAULT false,

  -- Monitoring settings
  monitoring_enabled boolean DEFAULT true,
  scan_frequency text DEFAULT 'daily', -- 'hourly', 'daily', 'weekly'
  last_scanned_at timestamptz,

  -- Metadata
  webhook_secret text, -- For webhook verification
  webhook_configured boolean DEFAULT false,
  metadata jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, repo_owner, repo_name)
);

-- Table: webhook_events
-- Stores incoming GitHub webhook events
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid REFERENCES registered_repositories(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'push', 'issues', 'pull_request', 'issue_comment', etc.
  action text, -- 'opened', 'closed', 'synchronize', etc.
  payload jsonb NOT NULL,
  processed boolean DEFAULT false,
  processed_at timestamptz,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL, -- Task created from this event
  created_at timestamptz NOT NULL DEFAULT now(),
  error_message text
);

-- Table: autonomous_scans
-- Scheduled autonomous repository scans
CREATE TABLE IF NOT EXISTS autonomous_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id uuid NOT NULL REFERENCES registered_repositories(id) ON DELETE CASCADE,
  scan_type text NOT NULL, -- 'scheduled', 'manual', 'webhook_triggered'
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'scanning', 'completed', 'failed'

  -- Scan results
  todos_found int DEFAULT 0,
  quality_issues_found int DEFAULT 0,
  open_issues_count int DEFAULT 0,
  tasks_created int DEFAULT 0,

  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table: autonomous_improvements
-- Track autonomous improvements made by the agent
CREATE TABLE IF NOT EXISTS autonomous_improvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  repo_id uuid REFERENCES registered_repositories(id) ON DELETE CASCADE,
  task_id uuid REFERENCES tasks(id) ON DELETE SET NULL,
  scan_id uuid REFERENCES autonomous_scans(id) ON DELETE SET NULL,

  improvement_type text NOT NULL, -- 'todo_completion', 'quality_fix', 'issue_resolution', 'pr_review'
  trigger_source text NOT NULL, -- 'scheduled_scan', 'webhook', 'manual'

  files_modified jsonb,
  commit_sha text,
  pr_number int,

  status text NOT NULL DEFAULT 'pending', -- 'pending', 'applied', 'failed', 'skipped'
  applied_at timestamptz,

  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS github_installations_user_id_idx ON github_installations(user_id);
CREATE INDEX IF NOT EXISTS registered_repositories_user_id_idx ON registered_repositories(user_id);
CREATE INDEX IF NOT EXISTS registered_repositories_monitoring_idx ON registered_repositories(monitoring_enabled, scan_frequency) WHERE monitoring_enabled = true;
CREATE INDEX IF NOT EXISTS webhook_events_repo_id_idx ON webhook_events(repo_id);
CREATE INDEX IF NOT EXISTS webhook_events_processed_idx ON webhook_events(processed, created_at) WHERE processed = false;
CREATE INDEX IF NOT EXISTS autonomous_scans_repo_id_idx ON autonomous_scans(repo_id);
CREATE INDEX IF NOT EXISTS autonomous_scans_status_idx ON autonomous_scans(status, created_at);
CREATE INDEX IF NOT EXISTS autonomous_improvements_user_id_idx ON autonomous_improvements(user_id);
CREATE INDEX IF NOT EXISTS autonomous_improvements_repo_id_idx ON autonomous_improvements(repo_id);

-- Enable Row Level Security
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE registered_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE autonomous_improvements ENABLE ROW LEVEL SECURITY;

-- RLS Policies for github_installations
CREATE POLICY "Users can view their own GitHub installations"
ON github_installations FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own GitHub installations"
ON github_installations FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own GitHub installations"
ON github_installations FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own GitHub installations"
ON github_installations FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for registered_repositories
CREATE POLICY "Users can view their own registered repositories"
ON registered_repositories FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own registered repositories"
ON registered_repositories FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own registered repositories"
ON registered_repositories FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own registered repositories"
ON registered_repositories FOR DELETE
USING (auth.uid() = user_id);

-- RLS Policies for webhook_events
CREATE POLICY "Users can view webhook events for their repositories"
ON webhook_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM registered_repositories
    WHERE registered_repositories.id = webhook_events.repo_id
    AND registered_repositories.user_id = auth.uid()
  )
);

-- RLS Policies for autonomous_scans
CREATE POLICY "Users can view scans for their repositories"
ON autonomous_scans FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM registered_repositories
    WHERE registered_repositories.id = autonomous_scans.repo_id
    AND registered_repositories.user_id = auth.uid()
  )
);

-- RLS Policies for autonomous_improvements
CREATE POLICY "Users can view their own autonomous improvements"
ON autonomous_improvements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own autonomous improvements"
ON autonomous_improvements FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_github_installations_updated_at
BEFORE UPDATE ON github_installations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_registered_repositories_updated_at
BEFORE UPDATE ON registered_repositories
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
