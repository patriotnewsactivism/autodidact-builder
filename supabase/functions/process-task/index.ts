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
const GITHUB_API_URL = 'https://api.github.com';

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

const createGithubRequester = (token: string) => {
  return async <T>(path: string, init: RequestInit = {}) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'autodidact-agent',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (init.body && !(init.headers && 'Content-Type' in init.headers)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${GITHUB_API_URL}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    const text = await response.text();

    if (!response.ok) {
      let message = response.statusText;
      try {
        const data = text ? JSON.parse(text) : null;
        if (data?.message) {
          message = data.message;
        }
      } catch (_error) {
        if (text) {
          message = text;
        }
      }
      throw new Error(message || 'GitHub request failed');
    }

    if (!text) {
      return null as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch (_error) {
      throw new Error('Unable to parse GitHub response');
    }
  };
};

interface AutoApplyResult {
  status: 'success' | 'failed' | 'skipped';
  message: string;
  commitSha?: string;
  commitUrl?: string;
  filesCommitted?: number;
}

const applyGeneratedChangesToGitHub = async (
  repo: { owner: string; name: string; branch: string },
  changes: Array<StepChange & { lineDelta: number }>,
  summary: string,
  instruction: string,
  token: string
): Promise<AutoApplyResult> => {
  if (changes.length === 0) {
    return {
      status: 'skipped',
      message: 'No generated changes to apply',
    };
  }

  const githubRequest = createGithubRequester(token);
  const ref = await githubRequest<{ object?: { sha?: string } }>(
    `/repos/${repo.owner}/${repo.name}/git/ref/heads/${encodeURIComponent(repo.branch)}`
  );
  const baseCommitSha = ref?.object?.sha;
  if (!baseCommitSha) {
    throw new Error('Unable to resolve branch head for auto-apply');
  }

  const latestCommit = await githubRequest<{ tree?: { sha?: string } }>(
    `/repos/${repo.owner}/${repo.name}/git/commits/${baseCommitSha}`
  );
  const baseTreeSha = latestCommit?.tree?.sha;
  if (!baseTreeSha) {
    throw new Error('Unable to resolve base tree for auto-apply');
  }

  const treeEntries: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];

  for (const change of changes) {
    if (!change.path) continue;

    if (change.action === 'delete') {
      treeEntries.push({
        path: change.path,
        mode: '100644',
        type: 'blob',
        sha: null,
      });
      continue;
    }

    if (typeof change.new_content !== 'string') {
      throw new Error(`Missing new content for ${change.path}`);
    }

    const blob = await githubRequest<{ sha: string }>(
      `/repos/${repo.owner}/${repo.name}/git/blobs`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: change.new_content,
          encoding: 'utf-8',
        }),
      }
    );

    treeEntries.push({
      path: change.path,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  if (treeEntries.length === 0) {
    return {
      status: 'skipped',
      message: 'No actionable tree entries for GitHub commit',
    };
  }

  const newTree = await githubRequest<{ sha: string }>(
    `/repos/${repo.owner}/${repo.name}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeEntries,
      }),
    }
  );

  const commitMessageBase = summary?.trim().length ? summary.trim() : instruction.trim();
  const commitMessage = `AutoDidact: ${commitMessageBase.slice(0, 120)}`;

  const commit = await githubRequest<{ sha: string }>(
    `/repos/${repo.owner}/${repo.name}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message: commitMessage,
        tree: newTree.sha,
        parents: [baseCommitSha],
      }),
    }
  );

  await githubRequest(`/repos/${repo.owner}/${repo.name}/git/refs/heads/${encodeURIComponent(repo.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha }),
  });

  return {
    status: 'success',
    message: `Committed ${treeEntries.length} change(s) to ${repo.branch}`,
    commitSha: commit.sha,
    commitUrl: `https://github.com/${repo.owner}/${repo.name}/commit/${commit.sha}`,
    filesCommitted: treeEntries.length,
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
    const filesForPrompt = files.map((file) => ({
      path: file.path,
      content: (file.content ?? '').slice(0, 8000),
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

    let totalLinesChanged = 0;
    let autoApplyResult: AutoApplyResult | null = null;
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

      const stepFilePayload = stepFiles.map(({ path }) => ({
        path,
        content: (fileContentMap.get(path) ?? '').slice(0, 10000),
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
        const original = fileContentMap.get(change.path) ?? '';
        let lineDelta = 0;

        if (change.action === 'delete') {
          lineDelta = -countLines(original);
          fileContentMap.delete(change.path);
        } else if (typeof change.new_content === 'string') {
          lineDelta = countLines(change.new_content) - countLines(original);
          fileContentMap.set(change.path, change.new_content);
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

    if (metadata.autoApply) {
      if (!githubToken) {
        autoApplyResult = {
          status: 'failed',
          message: 'Auto-apply requested but no GitHub token provided',
        };
      } else if (!metadata.repo) {
        autoApplyResult = {
          status: 'failed',
          message: 'Auto-apply requires repository information',
        };
      } else {
        try {
          autoApplyResult = await applyGeneratedChangesToGitHub(
            metadata.repo,
            generatedChanges,
            plan.summary ?? '',
            task.instruction,
            githubToken
          );

          if (autoApplyResult.status === 'success') {
            await supabase.from('activities').insert({
              user_id: task.user_id,
              task_id: taskId,
              type: 'git',
              status: 'success',
              message: autoApplyResult.message,
              metadata: {
                commitSha: autoApplyResult.commitSha,
                commitUrl: autoApplyResult.commitUrl,
                filesCommitted: autoApplyResult.filesCommitted,
              },
            });
          } else if (autoApplyResult.status === 'failed') {
            await supabase.from('activities').insert({
              user_id: task.user_id,
              task_id: taskId,
              type: 'git',
              status: 'error',
              message: autoApplyResult.message,
            });
          }
        } catch (autoApplyError) {
          const message =
            autoApplyError instanceof Error ? autoApplyError.message : 'Auto-apply failed';
          autoApplyResult = {
            status: 'failed',
            message,
          };
          await supabase.from('activities').insert({
            user_id: task.user_id,
            task_id: taskId,
            type: 'git',
            status: 'error',
            message,
          });
        }
      }
    }

    const taskMetadata = {
      ...metadata,
      plan,
      generatedChanges,
      stats: {
        linesChanged: totalLinesChanged,
        stepsExecuted: plan.steps.length,
        changesProposed: generatedChanges.length,
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

    const knowledgeDelta = generatedChanges.length > 0 ? 1 : 0;
    const { data: existingMetrics } = await supabase
      .from('agent_metrics')
      .select('lines_changed, tasks_completed, ai_decisions, knowledge_nodes, autonomy_level, learning_score')
      .eq('user_id', task.user_id)
      .maybeSingle();

    const aiDecisionsDelta = plan.steps.length;

    if (existingMetrics) {
      await supabase
        .from('agent_metrics')
        .update({
          lines_changed: (existingMetrics.lines_changed ?? 0) + totalLinesChanged,
          tasks_completed: (existingMetrics.tasks_completed ?? 0) + 1,
          ai_decisions: (existingMetrics.ai_decisions ?? 0) + aiDecisionsDelta,
          knowledge_nodes: (existingMetrics.knowledge_nodes ?? 0) + knowledgeDelta,
          autonomy_level: existingMetrics.autonomy_level ?? 92,
          learning_score: existingMetrics.learning_score ?? 75,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', task.user_id);
    } else {
      await supabase.from('agent_metrics').insert({
        user_id: task.user_id,
        lines_changed: totalLinesChanged,
        tasks_completed: 1,
        ai_decisions: aiDecisionsDelta,
        knowledge_nodes: knowledgeDelta,
        learning_score: 75,
        autonomy_level: 92,
      });
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
