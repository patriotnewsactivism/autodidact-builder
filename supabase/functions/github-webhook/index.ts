import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createHmac } from 'https://deno.land/std@0.177.0/node/crypto.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-github-event, x-hub-signature-256',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

/**
 * Verify GitHub webhook signature
 */
const verifySignature = (payload: string, signature: string, secret: string): boolean => {
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const hmac = createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = 'sha256=' + hmac.digest('hex');

  return signature === expectedSignature;
};

/**
 * Determine if webhook event should trigger autonomous action
 */
const shouldTriggerAutonomousAction = (
  eventType: string,
  action: string | undefined,
  repoSettings: {
    auto_fix_todos?: boolean;
    auto_fix_quality_issues?: boolean;
    auto_respond_to_issues?: boolean;
    auto_review_prs?: boolean;
  }
): boolean => {
  // Push events - always scan for TODOs and quality issues if enabled
  if (eventType === 'push') {
    return repoSettings.auto_fix_todos || repoSettings.auto_fix_quality_issues;
  }

  // Issue events - auto-respond if enabled
  if (eventType === 'issues' && action === 'opened' && repoSettings.auto_respond_to_issues) {
    return true;
  }

  // Pull request events - auto-review if enabled
  if (eventType === 'pull_request' && (action === 'opened' || action === 'synchronize') && repoSettings.auto_review_prs) {
    return true;
  }

  return false;
};

/**
 * Create autonomous task from webhook event
 */
const createTaskFromWebhookEvent = async (
  supabase: any,
  userId: string,
  repoId: string,
  repoOwner: string,
  repoName: string,
  defaultBranch: string,
  eventType: string,
  payload: any,
  webhookEventId: string
): Promise<string | null> => {
  let instruction = '';
  let metadata: any = {
    repo: {
      owner: repoOwner,
      name: repoName,
      branch: defaultBranch,
    },
    webhook_event_id: webhookEventId,
    trigger_source: 'webhook',
    autoApply: true, // Autonomous tasks should auto-apply
  };

  // Generate instruction based on event type
  if (eventType === 'push') {
    const commits = payload.commits || [];
    const commitMessages = commits.map((c: any) => c.message).join(', ');
    instruction = `Analyze recent push (${commits.length} commit(s): ${commitMessages.slice(0, 200)}). Scan for TODO/FIXME comments and code quality issues. Fix any issues found.`;

    metadata.files = commits.flatMap((c: any) => [
      ...(c.added || []).map((f: string) => ({ path: f })),
      ...(c.modified || []).map((f: string) => ({ path: f })),
    ]).slice(0, 10); // Limit to 10 files
  } else if (eventType === 'issues' && payload.action === 'opened') {
    const issue = payload.issue || {};
    instruction = `Analyze and respond to issue #${issue.number}: "${issue.title}". ${issue.body?.slice(0, 500) || ''}. Provide technical analysis and suggest potential fixes if applicable.`;

    metadata.issue = {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      url: issue.html_url,
    };
  } else if (eventType === 'pull_request') {
    const pr = payload.pull_request || {};
    instruction = `Review pull request #${pr.number}: "${pr.title}". Analyze code changes, check for quality issues, suggest improvements, and provide constructive feedback.`;

    metadata.pull_request = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.html_url,
      base_branch: pr.base?.ref,
      head_branch: pr.head?.ref,
    };
  } else {
    // Unknown event type, skip task creation
    return null;
  }

  // Create task
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert({
      user_id: userId,
      instruction,
      status: 'pending',
      metadata,
    })
    .select('id')
    .single();

  if (taskError) {
    console.error('Failed to create task from webhook:', taskError);
    return null;
  }

  return task.id;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase configuration');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get webhook headers
    const githubEvent = req.headers.get('x-github-event');
    const signature = req.headers.get('x-hub-signature-256');
    const deliveryId = req.headers.get('x-github-delivery');

    if (!githubEvent) {
      return new Response(
        JSON.stringify({ error: 'Missing x-github-event header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse payload
    const payloadText = await req.text();
    const payload = JSON.parse(payloadText);

    // Extract repository info
    const repository = payload.repository;
    if (!repository) {
      return new Response(
        JSON.stringify({ error: 'Missing repository in payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const repoOwner = repository.owner?.login || repository.owner?.name;
    const repoName = repository.name;
    const fullName = repository.full_name;

    // Find registered repository
    const { data: repo, error: repoError } = await supabase
      .from('registered_repositories')
      .select('*')
      .eq('full_name', fullName)
      .maybeSingle();

    if (repoError || !repo) {
      console.log(`Webhook received for unregistered repository: ${fullName}`);
      return new Response(
        JSON.stringify({
          message: 'Repository not registered for autonomous building',
          repository: fullName
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify webhook signature if secret is configured
    if (repo.webhook_secret && signature) {
      const isValid = verifySignature(payloadText, signature, repo.webhook_secret);
      if (!isValid) {
        console.error(`Invalid webhook signature for repository: ${fullName}`);
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Check if monitoring is enabled
    if (!repo.monitoring_enabled) {
      console.log(`Monitoring disabled for repository: ${fullName}`);
      return new Response(
        JSON.stringify({ message: 'Monitoring disabled for this repository' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store webhook event
    const { data: webhookEvent, error: webhookError } = await supabase
      .from('webhook_events')
      .insert({
        repo_id: repo.id,
        event_type: githubEvent,
        action: payload.action,
        payload,
        processed: false,
      })
      .select('id')
      .single();

    if (webhookError) {
      console.error('Failed to store webhook event:', webhookError);
      throw webhookError;
    }

    // Check if this event should trigger autonomous action
    const shouldTrigger = shouldTriggerAutonomousAction(
      githubEvent,
      payload.action,
      {
        auto_fix_todos: repo.auto_fix_todos,
        auto_fix_quality_issues: repo.auto_fix_quality_issues,
        auto_respond_to_issues: repo.auto_respond_to_issues,
        auto_review_prs: repo.auto_review_prs,
      }
    );

    let taskId: string | null = null;

    if (shouldTrigger) {
      // Create autonomous task
      taskId = await createTaskFromWebhookEvent(
        supabase,
        repo.user_id,
        repo.id,
        repoOwner,
        repoName,
        repo.default_branch,
        githubEvent,
        payload,
        webhookEvent.id
      );

      if (taskId) {
        // Update webhook event with task ID
        await supabase
          .from('webhook_events')
          .update({
            processed: true,
            processed_at: new Date().toISOString(),
            task_id: taskId,
          })
          .eq('id', webhookEvent.id);

        // Get GitHub token from installation
        const { data: installation } = await supabase
          .from('github_installations')
          .select('access_token')
          .eq('id', repo.installation_id)
          .single();

        // Invoke process-task function to execute the task
        if (installation?.access_token) {
          await supabase.functions.invoke('process-task', {
            body: { taskId },
            headers: {
              'x-github-token': installation.access_token,
            },
          });
        }
      }
    } else {
      // Just mark as processed without creating task
      await supabase
        .from('webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq('id', webhookEvent.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        event: githubEvent,
        action: payload.action,
        repository: fullName,
        triggered: shouldTrigger,
        taskId,
        deliveryId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook handler error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
