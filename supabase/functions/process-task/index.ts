import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface PlanStep {
  id: string;
  title: string;
  objective: string;
  target_files?: { path: string }[];
}

interface PlanResponse {
  summary?: string;
  steps: PlanStep[];
}

interface StepChange {
  path: string;
  action: 'update' | 'create' | 'delete';
  description?: string;
  language?: string;
  new_content?: string;
}

interface StepResponse {
  summary: string;
  changes: StepChange[];
  insights?: string[];
}

const GITHUB_API_URL = 'https://api.github.com';

class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
  }
}

interface GitHubRepoConfig {
  owner: string;
  name: string;
  branch: string;
}

interface GitHubFileSnapshot {
  path: string;
  content: string;
  sha: string | null;
}

interface AutoApplyResult {
  attempted: boolean;
  success: boolean;
  commitSha?: string;
  error?: string;
  filesChanged?: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-github-token',
};

const MODEL_ENDPOINT =
  Deno.env.get('OLLAMA_ENDPOINT') ??
  Deno.env.get('MODEL_URL');
const MODEL_NAME =
  Deno.env.get('OLLAMA_MODEL') ??
  Deno.env.get('MODEL_NAME') ??
  'phi4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ensureEnv = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  if (!MODEL_ENDPOINT) {
    throw new Error(
      'Model endpoint not configured. Set OLLAMA_ENDPOINT (recommended) or MODEL_URL for a compatible chat API.'
    );
  }
};

const stripJsonCodeFence = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return fenced[1].trim();
  }
  return value.trim();
};

const safeParseJson = <T>(value: string, fallback: T): T => {
  try {
    const cleaned = stripJsonCodeFence(value);
    return JSON.parse(cleaned) as T;
  } catch (_error) {
    return fallback;
  }
};

const countLines = (value: string | undefined | null) => {
  if (!value) return 0;
  return value.split(/\r\n|\r|\n/).length;
};

const decodeBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const encodePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const githubRequest = async <T>(
  path: string,
  init: RequestInit = {},
  token?: string
): Promise<T> => {
  const headers = new Headers(init.headers ?? {});
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await response.text();

  if (!response.ok) {
    let message = response.statusText || 'GitHub request failed';
    if (text) {
      try {
        const data = JSON.parse(text);
        if (data?.message) {
          message = data.message;
        }
      } catch (_error) {
        message = text;
      }
    }
    throw new GitHubError(response.status, message);
  }

  if (!text) {
    return null as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new GitHubError(response.status, 'Unable to parse GitHub response');
  }
};

const fetchGitHubFile = async (
  repo: GitHubRepoConfig,
  path: string,
  token?: string
): Promise<GitHubFileSnapshot | null> => {
  const encodedPath = encodePath(path);
  try {
    const data = await githubRequest<{
      type?: string;
      content?: string;
      encoding?: string;
      sha?: string;
    }>(
      `/repos/${repo.owner}/${repo.name}/contents/${encodedPath}?ref=${encodeURIComponent(repo.branch)}`,
      {},
      token
    );

    if (!data || data.type !== 'file' || !data.content || data.encoding !== 'base64') {
      return null;
    }

    return {
      path,
      content: decodeBase64(data.content),
      sha: data.sha ?? null,
    };
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) {
      return null;
    }
    throw error;
  }
};

const commitAutoAppliedChanges = async (
  repo: GitHubRepoConfig,
  changes: StepChange[],
  instruction: string,
  token: string
) => {
  if (changes.length === 0) {
    throw new Error('No changes to apply automatically');
  }

  const branchRef = await githubRequest<{ object?: { sha?: string } }>(
    `/repos/${repo.owner}/${repo.name}/git/ref/heads/${encodeURIComponent(repo.branch)}`,
    {},
    token
  );

  const baseCommitSha = branchRef?.object?.sha;
  if (!baseCommitSha) {
    throw new Error('Unable to resolve branch head for auto-apply commit');
  }

  const latestCommit = await githubRequest<{ tree?: { sha?: string } }>(
    `/repos/${repo.owner}/${repo.name}/git/commits/${baseCommitSha}`,
    {},
    token
  );

  const baseTreeSha = latestCommit?.tree?.sha;
  if (!baseTreeSha) {
    throw new Error('Unable to resolve base tree for auto-apply commit');
  }

  const finalChanges = new Map<
    string,
    { action: 'update' | 'create' | 'delete'; content?: string }
  >();
  changes.forEach((change) => {
    if (change.action === 'delete') {
      finalChanges.set(change.path, { action: 'delete' });
    } else if (typeof change.new_content === 'string') {
      finalChanges.set(change.path, {
        action: change.action,
        content: change.new_content,
      });
    }
  });

  if (finalChanges.size === 0) {
    throw new Error('No applicable changes to commit automatically');
  }

  const blobMap = new Map<string, string>();
  for (const [path, change] of finalChanges.entries()) {
    if (change.action === 'delete') continue;

    const blobResponse = await githubRequest<{ sha: string }>(
      `/repos/${repo.owner}/${repo.name}/git/blobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: change.content ?? '',
          encoding: 'utf-8',
        }),
      },
      token
    );

    blobMap.set(path, blobResponse.sha);
  }

  const treeEntries = Array.from(finalChanges.entries()).map(([path, change]) => ({
    path,
    mode: '100644',
    type: 'blob',
    sha: change.action === 'delete' ? null : blobMap.get(path),
  }));

  const newTree = await githubRequest<{ sha: string }>(
    `/repos/${repo.owner}/${repo.name}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    },
    token
  );

  const commitMessage = `AutoDidact: ${instruction.slice(0, 80)}`;
  const commitResponse = await githubRequest<{ sha: string }>(
    `/repos/${repo.owner}/${repo.name}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseCommitSha],
      }),
    },
    token
  );

  await githubRequest(
    `/repos/${repo.owner}/${repo.name}/git/refs/heads/${encodeURIComponent(repo.branch)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitResponse.sha }),
    },
    token
  );

  return {
    commitSha: commitResponse.sha,
    filesChanged: Array.from(finalChanges.keys()),
  };
};

const callModel = async (messages: ChatMessage[], expectJson: boolean) => {
  const body: Record<string, unknown> = {
    model: MODEL_NAME,
    messages,
    stream: false,
  };

  if (expectJson) {
    body.format = 'json';
  }

  const response = await fetch(`${MODEL_ENDPOINT}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Model request failed (${response.status}): ${errText}`);
  }

  const data = await response.json();
  if (typeof data === 'string') return data;
  if (data?.message?.content) return data.message.content as string;
  if (typeof data?.response === 'string') return data.response;
  if (Array.isArray(data?.messages)) {
    return data.messages.map((item: { content?: string }) => item.content ?? '').join('\n');
  }
  return JSON.stringify(data);
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let parsedBody: { taskId?: string } = {};

  try {
    ensureEnv();

    parsedBody = await req.json();
    const { taskId } = parsedBody;
    if (!taskId) {
      throw new Error('Missing taskId in request body');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const githubToken = req.headers.get('x-github-token')?.trim() ?? '';

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      throw new Error('Task not found');
    }

    await supabase
      .from('tasks')
      .update({
        status: 'processing',
        started_at: new Date().toISOString(),
      })
      .eq('id', taskId);

    const metadata = (task.metadata ?? {}) as {
      repo?: { owner: string; name: string; branch: string };
      files?: { path: string; content?: string; sha?: string | null }[];
      additionalContext?: string;
      autoApply?: boolean;
    };

    const files = metadata.files ?? [];
    const fileSnapshots = new Map<string, GitHubFileSnapshot>();
    files.forEach((file) => {
      fileSnapshots.set(file.path, {
        path: file.path,
        content: file.content ?? '',
        sha: file.sha ?? null,
      });
    });
    const filesForPrompt = Array.from(fileSnapshots.values()).map((file) => ({
      path: file.path,
      content: file.content.slice(0, 8000),
    }));

    const { data: knowledge } = await supabase
      .from('knowledge_nodes')
      .select('title, content')
      .eq('user_id', task.user_id)
      .order('created_at', { ascending: false })
      .limit(8);

    const knowledgeContext = (knowledge ?? []).map((item) => ({
      title: item.title,
      content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content),
    }));

    const planPrompt: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are AutoDidact, an autonomous coding agent. Produce concise JSON plans that break work into actionable steps. The JSON MUST follow {"summary": string, "steps": [{"id": string, "title": string, "objective": string, "target_files": [{"path": string}]}]}.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          instruction: task.instruction,
          repo: metadata.repo ?? null,
          files: filesForPrompt,
          knowledge: knowledgeContext,
          hints: metadata.additionalContext ?? null,
        }),
      },
    ];

    const rawPlan = await callModel(planPrompt, true);
    const plan = safeParseJson<PlanResponse>(rawPlan, { summary: '', steps: [] });

    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Model returned an empty plan');
    }

    await supabase.from('activities').insert({
      user_id: task.user_id,
      task_id: taskId,
      type: 'ai',
      status: 'progress',
      message: `Planning ${plan.steps.length} step(s)`,
      metadata: {
        summary: plan.summary ?? '',
        steps: plan.steps.map((step) => ({ id: step.id, title: step.title })),
      },
    });

    const fileContentMap = new Map<string, string>();
    files.forEach((file) => {
      fileContentMap.set(file.path, file.content ?? '');
    });

    const missingFilePaths = new Set<string>();
    const ensureFileSnapshot = async (path: string): Promise<GitHubFileSnapshot | null> => {
      if (fileSnapshots.has(path)) {
        return fileSnapshots.get(path)!;
      }

      if (!metadata.repo) {
        return null;
      }

      try {
        const fetched = await fetchGitHubFile(metadata.repo, path, githubToken || undefined);
        if (fetched) {
          fileSnapshots.set(path, fetched);
          await supabase.from('activities').insert({
            user_id: task.user_id,
            task_id: taskId,
            type: 'file',
            status: 'progress',
            message: `Fetched ${path} from GitHub for context`,
          });
          return fetched;
        }
      } catch (error) {
        await supabase.from('activities').insert({
          user_id: task.user_id,
          task_id: taskId,
          type: 'error',
          status: 'error',
          message: `Failed to load ${path} from GitHub: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        });
        return null;
      }

      if (!missingFilePaths.has(path)) {
        missingFilePaths.add(path);
        await supabase.from('activities').insert({
          user_id: task.user_id,
          task_id: taskId,
          type: 'warning',
          status: 'warning',
          message: `Context file ${path} not found in repository`,
        });
      }

      return null;
    };

    let totalLinesChanged = 0;
    const generatedChanges: Array<
      StepChange & {
        stepId: string;
        stepTitle: string;
        lineDelta: number;
        summary: string;
      }
    > = [];

    for (const step of plan.steps) {
      await supabase.from('activities').insert({
        user_id: task.user_id,
        task_id: taskId,
        type: 'ai',
        status: 'progress',
        message: `Executing step: ${step.title}`,
        metadata: { stepId: step.id },
      });

      const stepFiles =
        (step.target_files && step.target_files.length > 0
          ? step.target_files
          : files.map((file) => ({ path: file.path }))) ?? [];

      for (const { path } of stepFiles) {
        await ensureFileSnapshot(path);
      }

      const stepFilePayload = stepFiles.map(({ path }) => ({
        path,
        content: (fileSnapshots.get(path)?.content ?? '').slice(0, 10000),
      }));

      const stepPrompt: ChatMessage[] = [
        {
          role: 'system',
          content:
            'You are AutoDidact executing a coding step. Respond with strict JSON using {"summary": string, "changes": [{"path": string, "action": "update"|"create"|"delete", "description": string, "language": string, "new_content": string}]}. Always include full file content in new_content for update/create.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            instruction: task.instruction,
            step,
            repo: metadata.repo ?? null,
            files: stepFilePayload,
            knowledge: knowledgeContext,
          }),
        },
      ];

      const rawStep = await callModel(stepPrompt, true);
      const stepResult = safeParseJson<StepResponse>(rawStep, { summary: '', changes: [] });

      for (const change of stepResult.changes ?? []) {
        if (!change.path) continue;
        const existingSnapshot = fileSnapshots.get(change.path);
        const original = existingSnapshot?.content ?? '';
        let lineDelta = 0;

        if (change.action === 'delete') {
          lineDelta = -countLines(original);
          fileSnapshots.delete(change.path);
        } else if (typeof change.new_content === 'string') {
          lineDelta = countLines(change.new_content) - countLines(original);
          fileSnapshots.set(change.path, {
            path: change.path,
            content: change.new_content,
            sha: existingSnapshot?.sha ?? null,
          });
        } else {
          continue;
        }

        totalLinesChanged += Math.abs(lineDelta);
        generatedChanges.push({
          ...change,
          stepId: step.id,
          stepTitle: step.title,
          lineDelta,
          previousContent: original,
          summary: stepResult.summary,
        });
      }

      await supabase.from('activities').insert({
        user_id: task.user_id,
        task_id: taskId,
        type: 'code',
        status: 'success',
        message: `Completed step: ${step.title}`,
        metadata: {
          stepId: step.id,
          summary: stepResult.summary,
          filesChanged: stepResult.changes?.map((change) => change.path) ?? [],
        },
      });
    }

    const autoApplyResult: AutoApplyResult = {
      attempted: Boolean(metadata.autoApply),
      success: false,
    };

    if (metadata.autoApply) {
      if (!metadata.repo) {
        autoApplyResult.error = 'Repository information missing';
      } else if (!githubToken) {
        autoApplyResult.error = 'GitHub token required for auto-apply';
        await supabase.from('activities').insert({
          user_id: task.user_id,
          task_id: taskId,
          type: 'warning',
          status: 'warning',
          message: 'Auto-apply skipped: GitHub token is required',
        });
      } else if (generatedChanges.length === 0) {
        autoApplyResult.error = 'No generated changes available to apply';
      } else {
        await supabase.from('activities').insert({
          user_id: task.user_id,
          task_id: taskId,
          type: 'ai',
          status: 'progress',
          message: `Auto-applying ${generatedChanges.length} change(s) to GitHub`,
        });

        try {
          const commitInfo = await commitAutoAppliedChanges(
            metadata.repo,
            generatedChanges,
            task.instruction,
            githubToken
          );
          autoApplyResult.success = true;
          autoApplyResult.commitSha = commitInfo.commitSha;
          autoApplyResult.filesChanged = commitInfo.filesChanged;

          await supabase.from('activities').insert({
            user_id: task.user_id,
            task_id: taskId,
            type: 'success',
            status: 'success',
            message: `Auto-apply commit ${commitInfo.commitSha.slice(0, 7)} pushed to ${metadata.repo.branch}`,
            metadata: {
              filesChanged: commitInfo.filesChanged,
            },
          });
        } catch (error) {
          autoApplyResult.error = error instanceof Error ? error.message : 'Unknown error';
          await supabase.from('activities').insert({
            user_id: task.user_id,
            task_id: taskId,
            type: 'error',
            status: 'error',
            message: `Auto-apply failed: ${autoApplyResult.error}`,
          });
        }
      }
    } else {
      autoApplyResult.attempted = false;
    }

    const taskMetadata = {
      ...metadata,
      plan,
      generatedChanges,
      stats: {
        linesChanged: totalLinesChanged,
      },
      githubTokenUsed: Boolean(githubToken),
      autoApplyResult,
    };

    await supabase
      .from('tasks')
      .update({
        status: 'completed',
        result: plan.summary ?? 'Task completed',
        completed_at: new Date().toISOString(),
        metadata: taskMetadata,
      })
      .eq('id', taskId);

    if (generatedChanges.length > 0) {
      await supabase.from('knowledge_nodes').insert({
        user_id: task.user_id,
        title: plan.summary?.slice(0, 120) ?? task.instruction.slice(0, 120),
        content: JSON.stringify({
          instruction: task.instruction,
          summary: plan.summary,
          changes: generatedChanges,
        }),
        category: 'agent_outcome',
        confidence_score: 85,
        usage_count: 0,
      }).catch(() => {});
    }

    if (totalLinesChanged !== 0) {
      const { data: existingMetrics } = await supabase
        .from('agent_metrics')
        .select('lines_changed')
        .eq('user_id', task.user_id)
        .maybeSingle();

      if (existingMetrics) {
        await supabase
          .from('agent_metrics')
          .update({
            lines_changed: existingMetrics.lines_changed + totalLinesChanged,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', task.user_id);
      } else {
        await supabase.from('agent_metrics').insert({
          user_id: task.user_id,
          lines_changed: totalLinesChanged,
          tasks_completed: 0,
          learning_score: 75,
          autonomy_level: 92,
        });
      }
    }

    await supabase.from('activities').insert({
      user_id: task.user_id,
      task_id: taskId,
      type: 'success',
      status: 'success',
      message: `Agent task completed`,
      metadata: {
        linesChanged: totalLinesChanged,
        autoApply: metadata.autoApply ?? false,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        plan,
        generatedChanges,
        linesChanged: totalLinesChanged,
        autoApplyResult,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Agent error:', error);

    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        if (parsedBody?.taskId) {
          await supabase
            .from('tasks')
            .update({
              status: 'failed',
              error_message: error instanceof Error ? error.message : 'Unknown error',
              completed_at: new Date().toISOString(),
            })
            .eq('id', parsedBody.taskId);
        }
      } catch (updateError) {
        console.error('Failed to update task failure state:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
