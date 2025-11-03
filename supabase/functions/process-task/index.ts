import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Anthropic from 'npm:@anthropic-ai/sdk@^0.68.0';

type ChatMessage = {
  role: 'user' | 'assistant';
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

// AI Configuration - Claude Sonnet 4 via Anthropic API
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const MODEL_NAME = 'claude-sonnet-4-20250514';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const ensureEnv = () => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing Supabase configuration');
  }
  if (!ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY not configured. Add your Anthropic API key to environment variables.'
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
    const parsed = JSON.parse(cleaned);
    return parsed as T;
  } catch (error) {
    console.warn('JSON parse failed, using fallback:', error instanceof Error ? error.message : 'Unknown error');
    console.warn('Raw value:', value.slice(0, 500));
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

// Claude API integration
const callClaude = async (
  messages: ChatMessage[],
  systemPrompt: string,
  expectJson: boolean
): Promise<string> => {
  const client = new Anthropic({
    apiKey: ANTHROPIC_API_KEY!,
  });

  try {
    const response = await client.messages.create({
      model: MODEL_NAME,
      max_tokens: 8000,
      temperature: 0.7,
      system: systemPrompt,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
    });

    if (response.content && response.content.length > 0) {
      const textBlock = response.content[0];
      if (textBlock.type === 'text') {
        return textBlock.text;
      }
    }

    throw new Error('Invalid response from Claude API');
  } catch (error) {
    console.error('Claude API error:', error);
    throw new Error(`Claude API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
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
    if (!taskId || typeof taskId !== 'string') {
      throw new Error('Missing or invalid taskId in request body');
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const githubToken = req.headers.get('x-github-token')?.trim() ?? '';

    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .maybeSingle();

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

    // Planning phase with Claude
    const planSystemPrompt = `You are AutoDidact, an elite autonomous coding agent built with Claude Sonnet 4.

Your task is to analyze the user's instruction and create a precise, actionable plan.

CRITICAL RULES:
1. Respond ONLY with valid JSON - no markdown, no code fences, no explanations
2. Break complex tasks into 2-5 clear steps
3. Each step should have specific, targeted files
4. Be thorough but efficient

Required JSON format:
{
  "summary": "Brief description of what will be accomplished",
  "steps": [
    {
      "id": "step_1",
      "title": "Clear action title",
      "objective": "Detailed explanation of what this step achieves",
      "target_files": [{"path": "relative/file/path.ext"}]
    }
  ]
}`;

    const planUserMessage = JSON.stringify({
      instruction: task.instruction,
      repo: metadata.repo ?? null,
      files: filesForPrompt,
      knowledge: knowledgeContext,
      hints: metadata.additionalContext ?? null,
    }, null, 2);

    const rawPlan = await callClaude(
      [{ role: 'user', content: planUserMessage }],
      planSystemPrompt,
      true
    );

    const plan = safeParseJson<PlanResponse>(rawPlan, { summary: '', steps: [] });

    if (!plan.steps || plan.steps.length === 0) {
      throw new Error('Claude returned an empty plan. Raw response: ' + rawPlan.slice(0, 200));
    }

    await supabase.from('activities').insert({
      user_id: task.user_id,
      task_id: taskId,
      type: 'ai',
      status: 'progress',
      message: `🎯 Planned ${plan.steps.length} step(s): ${plan.summary || 'Processing task'}`,
      metadata: {
        summary: plan.summary ?? '',
        steps: plan.steps.map((step) => ({ id: step.id, title: step.title })),
        model: MODEL_NAME,
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
            message: `📥 Fetched ${path} from GitHub (${countLines(fetched.content)} lines)`,
          });
          return fetched;
        }
      } catch (error) {
        await supabase.from('activities').insert({
          user_id: task.user_id,
          task_id: taskId,
          type: 'error',
          status: 'error',
          message: `❌ Failed to load ${path}: ${
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
          message: `⚠️ Context file ${path} not found in repository (will be created if needed)`,
        });
      }

      return null;
    };

    let totalLinesChanged = 0;
    let totalLinesAdded = 0;
    let totalLinesRemoved = 0;
    const autoApplyResult: AutoApplyResult = {
      attempted: false,
      success: false,
    };
    const generatedChanges: Array<
      StepChange & {
        stepId: string;
        stepTitle: string;
        lineDelta: number;
        summary: string;
      }
    > = [];

    // Execute each step with Claude
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      await supabase.from('activities').insert({
        user_id: task.user_id,
        task_id: taskId,
        type: 'ai',
        status: 'progress',
        message: `⚙️ Step ${i + 1}/${plan.steps.length}: ${step.title}`,
        metadata: { stepId: step.id, stepNumber: i + 1, totalSteps: plan.steps.length },
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

      const stepSystemPrompt = `You are AutoDidact executing step ${i + 1} of ${plan.steps.length} in your coding plan.

CRITICAL RULES:
1. Respond ONLY with valid JSON - no markdown, no code fences
2. Provide COMPLETE file content in new_content (never partial updates)
3. Be precise and production-ready
4. Include thoughtful comments
5. Follow best practices for the language

Required JSON format:
{
  "summary": "What was accomplished in this step",
  "changes": [
    {
      "path": "relative/file/path.ext",
      "action": "update|create|delete",
      "description": "What changed and why",
      "language": "javascript|typescript|python|etc",
      "new_content": "FULL FILE CONTENT HERE (omit only for delete action)"
    }
  ],
  "insights": ["Optional: Key decisions made", "Optional: Gotchas to watch"]
}`;

      const stepUserMessage = JSON.stringify({
        instruction: task.instruction,
        step: step,
        repo: metadata.repo ?? null,
        files: stepFilePayload,
        knowledge: knowledgeContext,
      }, null, 2);

      const rawStep = await callClaude(
        [{ role: 'user', content: stepUserMessage }],
        stepSystemPrompt,
        true
      );

      const stepResult = safeParseJson<StepResponse>(rawStep, { summary: '', changes: [] });

      for (const change of stepResult.changes ?? []) {
        if (!change.path) continue;
        const existingSnapshot = fileSnapshots.get(change.path);
        const original = existingSnapshot?.content ?? '';
        let lineDelta = 0;

        if (change.action === 'delete') {
          const linesDeleted = countLines(original);
          lineDelta = -linesDeleted;
          totalLinesRemoved += linesDeleted;
          fileSnapshots.delete(change.path);
        } else if (typeof change.new_content === 'string') {
          const newLineCount = countLines(change.new_content);
          const oldLineCount = countLines(original);
          lineDelta = newLineCount - oldLineCount;

          if (lineDelta > 0) {
            totalLinesAdded += lineDelta;
          } else {
            totalLinesRemoved += Math.abs(lineDelta);
          }

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
          summary: stepResult.summary,
        });
      }

      const changesSummary = stepResult.changes?.length
        ? stepResult.changes.map(c => `${c.action} ${c.path}`).join(', ')
        : 'no changes';

      await supabase.from('activities').insert({
        user_id: task.user_id,
        task_id: taskId,
        type: 'code',
        status: 'success',
        message: `✅ Completed: ${step.title} (${changesSummary})`,
        metadata: {
          stepId: step.id,
          summary: stepResult.summary,
          filesChanged: stepResult.changes?.map((change) => change.path) ?? [],
          insights: stepResult.insights,
        },
      });
    }

    autoApplyResult.attempted = Boolean(metadata.autoApply);

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
          message: '⚠️ Auto-apply skipped: GitHub token is required',
        });
      } else if (generatedChanges.length === 0) {
        autoApplyResult.error = 'No generated changes available to apply';
      } else {
        await supabase.from('activities').insert({
          user_id: task.user_id,
          task_id: taskId,
          type: 'ai',
          status: 'progress',
          message: `🚀 Auto-applying ${generatedChanges.length} change(s) to ${metadata.repo.branch}...`,
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
            message: `🎉 Auto-applied to ${metadata.repo.branch}: ${commitInfo.commitSha.slice(0, 7)} (${commitInfo.filesChanged.length} files)`,
            metadata: {
              filesChanged: commitInfo.filesChanged,
              commitSha: commitInfo.commitSha,
            },
          });
        } catch (error) {
          autoApplyResult.error = error instanceof Error ? error.message : 'Unknown error';
          await supabase.from('activities').insert({
            user_id: task.user_id,
            task_id: taskId,
            type: 'error',
            status: 'error',
            message: `❌ Auto-apply failed: ${autoApplyResult.error}`,
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
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved,
        stepsExecuted: plan.steps.length,
        changesProposed: generatedChanges.length,
        model: MODEL_NAME,
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
      const { error: knowledgeError } = await supabase.from('knowledge_nodes').insert({
        user_id: task.user_id,
        title: plan.summary?.slice(0, 120) ?? task.instruction.slice(0, 120),
        content: JSON.stringify({
          instruction: task.instruction,
          summary: plan.summary,
          changes: generatedChanges,
          model: MODEL_NAME,
          timestamp: new Date().toISOString(),
        }),
        category: 'agent_outcome',
        confidence_score: 90,
        usage_count: 0,
      });
      if (knowledgeError) {
        console.error('Failed to insert knowledge node:', knowledgeError);
      }
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
          autonomy_level: Math.min(100, (existingMetrics.autonomy_level ?? 92) + 1),
          learning_score: Math.min(100, (existingMetrics.learning_score ?? 75) + 2),
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
      message: `🎊 Task completed! Changed ${totalLinesChanged} lines (+${totalLinesAdded}/-${totalLinesRemoved}) across ${generatedChanges.length} files`,
      metadata: {
        linesChanged: totalLinesChanged,
        linesAdded: totalLinesAdded,
        linesRemoved: totalLinesRemoved,
        filesChanged: generatedChanges.length,
        autoApply: metadata.autoApply ?? false,
        model: MODEL_NAME,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        plan,
        generatedChanges,
        linesChanged: totalLinesChanged,
        autoApplyResult,
        stats: {
          linesAdded: totalLinesAdded,
          linesRemoved: totalLinesRemoved,
          filesModified: generatedChanges.length,
          model: MODEL_NAME,
        },
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
