/**
 * IntegratedAgentWorkspace - Fully integrated autonomous agent with all features
 *
 * Combines:
 * - ModernAgentWorkspace UI
 * - Real-time diff viewer
 * - Multi-agent execution
 * - Cost/time estimation
 * - Live preview
 * - Progress streaming
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/auth/useAuth';
import { useAgentData } from '@/hooks/useAgentData';
import { useSecureGithubToken } from '@/hooks/useSecureGithubToken';
import { ModernAgentWorkspace } from './ModernAgentWorkspace';
import { RealTimeDiffViewer } from './RealTimeDiffViewer';
import { EnhancedMetrics } from './EnhancedMetrics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import {
  Settings, Github, Save, Play, Zap, Code2, Eye, GitCompare,
  TrendingUp, Clock, DollarSign, Users, AlertCircle, CheckCircle,
  Loader2, RefreshCw, FileCode
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentGeneratedChange } from '@/types/agent';

interface AgentRun {
  id: string;
  agentId: string;
  taskId: string;
  status: 'idle' | 'running' | 'completed' | 'error';
  progress: number;
  currentStep: string;
  filesChanged: number;
  linesChanged: number;
  linesAdded: number;
  linesRemoved: number;
  startTime: Date;
  estimatedTimeRemaining: number;
  estimatedCost: number;
  actualCost?: number;
  changes: AgentGeneratedChange[];
}

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  language?: string;
}

export function IntegratedAgentWorkspace() {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const {
    token,
    setToken,
    persistToken,
    isLoading: tokenLoading,
    isSaving: tokenSaving,
    lastUpdated: tokenLastUpdated,
    error: tokenError,
    hasStoredToken,
    providerToken,
    syncProviderToken,
  } = useSecureGithubToken(session);
  const {
    activities,
    stats,
    tasks,
    executeTask,
    isExecutingTask,
    refreshAgentData,
  } = useAgentData(user?.id);

  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [diffs, setDiffs] = useState<FileDiff[]>([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [isConnected, setIsConnected] = useState(false);
  const [activeView, setActiveView] = useState<'workspace' | 'classic'>('workspace');

  // Parse repo URL
  const repoInfo = useMemo(() => {
    if (!repoUrl) return null;
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return {
      owner: match[1],
      name: match[2].replace('.git', ''),
      branch,
    };
  }, [repoUrl, branch]);

  // Calculate cost per 1K tokens
  const COST_PER_1K_INPUT = 0.003; // $3 per million tokens
  const COST_PER_1K_OUTPUT = 0.015; // $15 per million tokens

  const estimateTaskCost = useCallback((instruction: string, fileCount: number): number => {
    // Rough estimation based on instruction length and file count
    const instructionTokens = instruction.split(' ').length * 1.3; // rough token estimate
    const contextTokens = fileCount * 500; // assume 500 tokens per file
    const outputTokens = 2000; // estimated response

    const inputCost = ((instructionTokens + contextTokens) / 1000) * COST_PER_1K_INPUT;
    const outputCost = (outputTokens / 1000) * COST_PER_1K_OUTPUT;

    return inputCost + outputCost;
  }, []);

  const estimateTaskTime = useCallback((instruction: string, fileCount: number): number => {
    // Estimate based on complexity
    const words = instruction.split(' ').length;
    const baseTime = 30; // 30 seconds minimum
    const wordFactor = words * 2; // 2 seconds per word
    const fileFactor = fileCount * 10; // 10 seconds per file

    return Math.max(baseTime, wordFactor + fileFactor);
  }, []);

  // Execute task with multi-agent support
  const handleExecuteTask = useCallback(async (instruction: string, agentCount: number) => {
    if (!user || !repoInfo || !token) {
      toast({
        title: 'Configuration required',
        description: 'Please connect GitHub and configure repository',
        variant: 'destructive',
      });
      return;
    }

    try {
      const estimatedCost = estimateTaskCost(instruction, 5);
      const estimatedTime = estimateTaskTime(instruction, 5);

      // Create agent runs
      const newRuns: AgentRun[] = [];

      for (let i = 0; i < agentCount; i++) {
        const runId = `agent-${Date.now()}-${i}`;
        const run: AgentRun = {
          id: runId,
          agentId: `Agent ${i + 1}`,
          taskId: '',
          status: 'running',
          progress: 0,
          currentStep: 'Initializing...',
          filesChanged: 0,
          linesChanged: 0,
          linesAdded: 0,
          linesRemoved: 0,
          startTime: new Date(),
          estimatedTimeRemaining: estimatedTime / agentCount,
          estimatedCost: estimatedCost / agentCount,
          changes: [],
        };
        newRuns.push(run);
      }

      setRuns(prev => [...prev, ...newRuns]);

      // Execute tasks in parallel
      const taskPromises = newRuns.map(async (run) => {
        const taskResult = await executeTask(instruction, {
          repo: repoInfo,
          token,
          autoApply: false,
        });

        if (taskResult) {
          // Update run with task ID
          setRuns(prev => prev.map(r =>
            r.id === run.id ? { ...r, taskId: taskResult.id } : r
          ));
        }
      });

      await Promise.all(taskPromises);

      toast({
        title: 'Tasks completed',
        description: `${agentCount} agent${agentCount > 1 ? 's' : ''} finished processing`,
      });

    } catch (error) {
      console.error('Task execution error:', error);
      toast({
        title: 'Execution failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  }, [user, repoInfo, token, executeTask, estimateTaskCost, estimateTaskTime, toast]);

  // Update runs based on task status
  useEffect(() => {
    if (tasks.length === 0) return;

    setRuns(prev => prev.map(run => {
      const task = tasks.find(t => t.id === run.taskId);
      if (!task) return run;

      // Calculate progress
      const progress = task.status === 'completed' ? 100 :
                      task.status === 'processing' ? 50 :
                      task.status === 'failed' ? 0 : 0;

      // Calculate actual stats from metadata
      const metadata = task.metadata || {};
      const stats = metadata.stats || {};

      return {
        ...run,
        status: task.status === 'completed' ? 'completed' :
                task.status === 'processing' ? 'running' :
                task.status === 'failed' ? 'error' : run.status,
        progress,
        currentStep: task.status === 'processing' ? 'Executing...' :
                     task.status === 'completed' ? 'Completed' :
                     task.status === 'failed' ? 'Failed' : run.currentStep,
        linesAdded: stats.linesAdded || 0,
        linesRemoved: stats.linesRemoved || 0,
        linesChanged: stats.linesChanged || 0,
        filesChanged: (metadata.generatedChanges ?? []).length,
        estimatedTimeRemaining: task.status === 'completed' ? 0 : run.estimatedTimeRemaining,
        changes: metadata.generatedChanges ?? [],
      };
    }));

    // Update diffs when changes are available
    tasks.forEach(task => {
      const changes = task.metadata?.generatedChanges ?? [];
      if (changes.length > 0) {
        const newDiffs: FileDiff[] = changes.map(change => ({
          path: change.path,
          oldContent: '', // Would need to fetch from GitHub
          newContent: change.new_content || '',
          language: change.language,
        }));
        setDiffs(prev => [...prev, ...newDiffs]);
      }
    });
  }, [tasks]);

  // Connect to GitHub
  const handleConnect = useCallback(async () => {
    if (!repoUrl || !token) {
      toast({
        title: 'Configuration required',
        description: 'Enter repository URL and GitHub token',
        variant: 'destructive',
      });
      return;
    }

    if (!repoInfo) {
      toast({
        title: 'Invalid repository URL',
        description: 'Enter a valid GitHub repository URL',
        variant: 'destructive',
      });
      return;
    }

    setIsConnected(true);
    toast({
      title: 'Connected',
      description: `Connected to ${repoInfo.owner}/${repoInfo.name}`,
    });
  }, [repoUrl, token, repoInfo, toast]);

  const handleTokenSave = useCallback(async () => {
    const saved = await persistToken();
    if (saved) {
      toast({ title: 'Token saved securely', description: 'Your GitHub token is encrypted locally.' });
    } else {
      toast({
        title: 'Token not saved',
        description: 'Review the token error message and try again.',
        variant: 'destructive',
      });
    }
  }, [persistToken, toast]);

  const handleSyncFromGithub = useCallback(async () => {
    const synced = await syncProviderToken();
    if (synced) {
      toast({
        title: 'GitHub login connected',
        description: 'Using your GitHub OAuth token for agent operations.',
      });
    } else {
      toast({
        title: 'Unable to sync GitHub token',
        description: 'Complete GitHub login to import your token automatically.',
        variant: 'destructive',
      });
    }
  }, [syncProviderToken, toast]);

  const showProviderSync = Boolean(providerToken && !hasStoredToken);
  const isTokenBusy = tokenLoading || tokenSaving;
  const connectDisabled = !repoUrl || !token || tokenLoading;

  // Render workspace view
  if (activeView === 'workspace') {
    return (
      <div className="h-screen flex flex-col bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        {/* Configuration Bar */}
        {!isConnected && (
          <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur-sm">
            <div className="p-6">
              <div className="max-w-4xl mx-auto space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <Settings className="h-5 w-5 text-slate-400" />
                  <h2 className="text-lg font-semibold text-white">Setup Configuration</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="repo-url" className="text-slate-300">
                      GitHub Repository URL
                    </Label>
                    <Input
                      id="repo-url"
                      placeholder="https://github.com/owner/repo"
                      value={repoUrl}
                      onChange={(e) => setRepoUrl(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="branch" className="text-slate-300">
                      Branch
                    </Label>
                    <Input
                      id="branch"
                      placeholder="main"
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="bg-slate-800 border-slate-700 text-white"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="github-token" className="text-slate-300">
                    GitHub Access Token
                  </Label>
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col md:flex-row gap-2">
                      <Input
                        id="github-token"
                        type="password"
                        placeholder="ghp_..."
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                        disabled={isTokenBusy}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={handleTokenSave}
                          disabled={!token || isTokenBusy}
                          className="whitespace-nowrap"
                        >
                          {isTokenBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Save token'
                          )}
                        </Button>
                        {showProviderSync && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleSyncFromGithub}
                            disabled={isTokenBusy}
                            className="whitespace-nowrap"
                          >
                            Sync GitHub login
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>
                        Token needs <code className="px-1 py-0.5 bg-slate-800 rounded">repo</code> scope
                      </span>
                      {tokenLastUpdated && (
                        <span>Saved {tokenLastUpdated.toLocaleString()}</span>
                      )}
                      {showProviderSync && (
                        <Badge variant="outline" className="border-slate-600 text-slate-200">
                          Using GitHub OAuth token
                        </Badge>
                      )}
                    </div>
                    {tokenError && <p className="text-xs text-destructive">{tokenError}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleConnect}
                      disabled={connectDisabled}
                      className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                    >
                      <Github className="h-4 w-4 mr-2" />
                      {connectDisabled && !repoUrl ? 'Enter repo URL' : 'Connect'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Workspace */}
        {isConnected ? (
          <div className="flex-1 overflow-hidden">
            <ModernAgentWorkspace 
              repoInfo={repoInfo}
              token={token}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-md">
              <Github className="h-16 w-16 text-slate-600 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">
                Connect to GitHub
              </h3>
              <p className="text-slate-400">
                Configure your repository and token above to start using the autonomous agent
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Classic view with metrics
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6">
        <EnhancedMetrics
          activities={activities}
          stats={stats}
          currentTaskStats={
            tasks[0]?.metadata?.stats
              ? {
                  linesAdded: tasks[0].metadata.stats.linesAdded,
                  linesRemoved: tasks[0].metadata.stats.linesRemoved,
                  filesModified: (tasks[0].metadata.generatedChanges ?? []).length,
                  model: tasks[0].metadata.stats.model,
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
