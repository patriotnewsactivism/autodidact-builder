import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GITHUB_API_URL = 'https://api.github.com';

interface ScanResult {
  todosFound: number;
  qualityIssuesFound: number;
  openIssuesCount: number;
  tasksCreated: number;
  files: Array<{
    path: string;
    todos: Array<{ line: number; text: string }>;
  }>;
}

/**
 * Scan repository files for TODO/FIXME comments
 */
const scanForTodos = (content: string, filePath: string): Array<{ line: number; text: string }> => {
  const todos: Array<{ line: number; text: string }> = [];
  const lines = content.split('\n');

  const todoPatterns = [
    /\/\/\s*TODO:?\s*(.+)/i,
    /\/\/\s*FIXME:?\s*(.+)/i,
    /\/\*\s*TODO:?\s*(.+)\s*\*\//i,
    /#\s*TODO:?\s*(.+)/i,
    /<!--\s*TODO:?\s*(.+)\s*-->/i,
  ];

  lines.forEach((line, index) => {
    for (const pattern of todoPatterns) {
      const match = line.match(pattern);
      if (match) {
        todos.push({
          line: index + 1,
          text: match[1]?.trim() || match[0].trim(),
        });
        break;
      }
    }
  });

  return todos;
};

/**
 * Fetch repository file tree from GitHub
 */
const fetchRepoTree = async (
  owner: string,
  name: string,
  branch: string,
  token: string
): Promise<Array<{ path: string; sha: string; type: string }>> => {
  const response = await fetch(
    `${GITHUB_API_URL}/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch repository tree: ${response.statusText}`);
  }

  const data = await response.json();
  return (data.tree || []).filter(
    (item: any) =>
      item.type === 'blob' &&
      // Only scan code files
      /\.(ts|tsx|js|jsx|py|java|go|rs|c|cpp|h|hpp|cs|rb|php|swift|kt)$/i.test(item.path)
  );
};

/**
 * Fetch file content from GitHub
 */
const fetchFileContent = async (
  owner: string,
  name: string,
  path: string,
  token: string
): Promise<string | null> => {
  try {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${name}/contents/${encodeURIComponent(path)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.raw',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error(`Failed to fetch ${path}:`, error);
    return null;
  }
};

/**
 * Fetch open issues from GitHub
 */
const fetchOpenIssues = async (
  owner: string,
  name: string,
  token: string
): Promise<number> => {
  try {
    const response = await fetch(
      `${GITHUB_API_URL}/repos/${owner}/${name}/issues?state=open&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      }
    );

    if (!response.ok) {
      return 0;
    }

    // GitHub returns link header with pagination info
    const linkHeader = response.headers.get('link');
    if (linkHeader) {
      const match = linkHeader.match(/page=(\d+)>; rel="last"/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    const issues = await response.json();
    return Array.isArray(issues) ? issues.length : 0;
  } catch (error) {
    console.error('Failed to fetch open issues:', error);
    return 0;
  }
};

/**
 * Perform autonomous repository scan
 */
const performRepositoryScan = async (
  supabase: any,
  repo: any,
  token: string
): Promise<ScanResult> => {
  const result: ScanResult = {
    todosFound: 0,
    qualityIssuesFound: 0,
    openIssuesCount: 0,
    tasksCreated: 0,
    files: [],
  };

  try {
    // Fetch repository file tree
    const tree = await fetchRepoTree(repo.repo_owner, repo.repo_name, repo.default_branch, token);

    // Limit to 50 files for performance (can be adjusted)
    const filesToScan = tree.slice(0, 50);

    // Scan files for TODOs
    for (const file of filesToScan) {
      const content = await fetchFileContent(repo.repo_owner, repo.repo_name, file.path, token);
      if (!content) continue;

      const todos = scanForTodos(content, file.path);
      if (todos.length > 0) {
        result.todosFound += todos.length;
        result.files.push({
          path: file.path,
          todos,
        });
      }
    }

    // Fetch open issues count
    result.openIssuesCount = await fetchOpenIssues(repo.repo_owner, repo.repo_name, token);

    // Create autonomous task if TODOs found and auto-fix is enabled
    if (result.todosFound > 0 && repo.auto_fix_todos) {
      const todoSummary = result.files
        .slice(0, 5)
        .map((f) => `${f.path}: ${f.todos.length} TODO(s)`)
        .join(', ');

      const instruction = `Autonomous scan detected ${result.todosFound} TODO/FIXME comment(s) in the repository. Address the following TODOs: ${todoSummary}. Implement the features or fixes described in these comments.`;

      const { data: task, error: taskError } = await supabase
        .from('tasks')
        .insert({
          user_id: repo.user_id,
          instruction,
          status: 'pending',
          metadata: {
            repo: {
              owner: repo.repo_owner,
              name: repo.repo_name,
              branch: repo.default_branch,
            },
            trigger_source: 'scheduled_scan',
            autoApply: repo.auto_apply_enabled,
            scan_results: {
              todos_found: result.todosFound,
              files: result.files.slice(0, 10), // Limit metadata size
            },
            files: result.files.slice(0, 10).map((f) => ({ path: f.path })),
          },
        })
        .select('id')
        .single();

      if (!taskError && task) {
        result.tasksCreated++;

        // Invoke process-task to execute the autonomous task
        await supabase.functions.invoke('process-task', {
          body: { taskId: task.id },
          headers: {
            'x-github-token': token,
          },
        });
      }
    }

    return result;
  } catch (error) {
    console.error('Repository scan error:', error);
    throw error;
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Parse request body (optional - can specify specific repo_id)
    let targetRepoId: string | null = null;
    try {
      const body = await req.json();
      targetRepoId = body.repo_id || null;
    } catch {
      // No body or invalid JSON - scan all eligible repos
    }

    // Find repositories that need scanning
    const query = supabase
      .from('registered_repositories')
      .select('*, github_installations!inner(access_token)')
      .eq('monitoring_enabled', true);

    if (targetRepoId) {
      query.eq('id', targetRepoId);
    } else {
      // Find repos that need scanning based on frequency
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // This is a simplified version - in production you'd want more sophisticated scheduling
      query.or(
        `last_scanned_at.is.null,and(scan_frequency.eq.hourly,last_scanned_at.lt.${hourAgo.toISOString()}),and(scan_frequency.eq.daily,last_scanned_at.lt.${dayAgo.toISOString()}),and(scan_frequency.eq.weekly,last_scanned_at.lt.${weekAgo.toISOString()})`
      );
    }

    const { data: repos, error: repoError } = await query;

    if (repoError) {
      throw repoError;
    }

    if (!repos || repos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No repositories need scanning at this time',
          scanned: 0,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scanResults = [];

    // Scan each repository
    for (const repo of repos) {
      const token = repo.github_installations?.access_token;
      if (!token) {
        console.warn(`No GitHub token available for repository: ${repo.full_name}`);
        continue;
      }

      // Create scan record
      const { data: scan, error: scanError } = await supabase
        .from('autonomous_scans')
        .insert({
          repo_id: repo.id,
          scan_type: targetRepoId ? 'manual' : 'scheduled',
          status: 'scanning',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (scanError) {
        console.error('Failed to create scan record:', scanError);
        continue;
      }

      try {
        const result = await performRepositoryScan(supabase, repo, token);

        // Update scan record with results
        await supabase
          .from('autonomous_scans')
          .update({
            status: 'completed',
            todos_found: result.todosFound,
            quality_issues_found: result.qualityIssuesFound,
            open_issues_count: result.openIssuesCount,
            tasks_created: result.tasksCreated,
            completed_at: new Date().toISOString(),
            metadata: {
              files_scanned: result.files.length,
              files_with_todos: result.files.filter((f) => f.todos.length > 0).length,
            },
          })
          .eq('id', scan.id);

        // Update repository last_scanned_at
        await supabase
          .from('registered_repositories')
          .update({ last_scanned_at: new Date().toISOString() })
          .eq('id', repo.id);

        scanResults.push({
          repository: repo.full_name,
          ...result,
        });
      } catch (error) {
        // Update scan record with error
        await supabase
          .from('autonomous_scans')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            completed_at: new Date().toISOString(),
          })
          .eq('id', scan.id);

        console.error(`Scan failed for ${repo.full_name}:`, error);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        scanned: scanResults.length,
        results: scanResults,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Scheduled scan error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
