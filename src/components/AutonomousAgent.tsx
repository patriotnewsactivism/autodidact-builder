import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle,
  Clock,
  ExternalLink,
  FileCode,
  FileDiff,
  Folder,
  GitBranch,
  GitCommit,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sigma,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const GITHUB_API_URL = 'https://api.github.com';
const CONNECTION_STORAGE_KEY = 'autodidact-builder:github-connection';
const MAX_LINE_COUNT_BLOBS = 400;

type StatusLevel = 'info' | 'success' | 'error';
type OperationStatus = 'running' | 'success' | 'error';

interface StatusEntry {
  id: string;
  message: string;
  level: StatusLevel;
  timestamp: Date;
}

interface OperationEntry {
  id: string;
  label: string;
  status: OperationStatus;
  startedAt: Date;
  finishedAt?: Date;
  message?: string;
  progress?: {
    current: number;
    total?: number;
  };
}

interface RepoInfo {
  full_name: string;
  description: string | null;
  default_branch: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  watchers_count: number;
  html_url: string;
  pushed_at: string;
}

interface BranchInfo {
  name: string;
}

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir';
}

interface GitHubFileResponse extends GitHubContent {
  encoding: 'base64';
  content: string;
}

interface CommitEntry {
  sha: string;
  message: string;
  authorName: string;
  date: string;
  url: string;
}

interface SelectedFile {
  path: string;
  sha: string;
  content: string;
  originalContent: string;
}

interface AgentWorkspaceProps {
  agentId: string;
  agentName: string;
}

const formatDate = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString();
};

const encodeContent = (value: string) => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const decodeContent = (value: string) => {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const encodePath = (path: string) =>
  path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

const countLines = (value: string) => {
  if (!value) {
    return 0;
  }
  return value.split(/\r\n|\r|\n/).length;
};

const isProbablyBinary = (value: string) => {
  if (!value) return false;
  const sample = value.slice(0, 1024);
  let controlCharacters = 0;
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 9 || code === 10 || code === 13) continue;
    if (code < 32 || code === 65533) {
      controlCharacters += 1;
    }
  }
  return controlCharacters / sample.length > 0.2;
};

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

const AgentWorkspace: React.FC<AgentWorkspaceProps> = ({ agentId, agentName }) => {
  const storageKey = `${CONNECTION_STORAGE_KEY}:${agentId}`;
  const { toast } = useToast();
  const [token, setToken] = useState('');
  const [repoInput, setRepoInput] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [connectionState, setConnectionState] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [contents, setContents] = useState<GitHubContent[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [commits, setCommits] = useState<CommitEntry[]>([]);
  const [statusLog, setStatusLog] = useState<StatusEntry[]>([]);
  const [operations, setOperations] = useState<OperationEntry[]>([]);
  const [trackedEdits, setTrackedEdits] = useState<Record<string, { isDirty: boolean; lineDelta: number }>>({});
  const [committedPaths, setCommittedPaths] = useState<string[]>([]);
  const [sessionLinesChanged, setSessionLinesChanged] = useState(0);
  const [totalLineCount, setTotalLineCount] = useState<number | null>(null);
  const [lineCountStatus, setLineCountStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [lineCountError, setLineCountError] = useState<string | null>(null);
  const [isLoadingContents, setIsLoadingContents] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingCommits, setIsLoadingCommits] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(storageKey);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved) as { repo: string; branch?: string };
      setRepoInput(parsed.repo ?? '');
      if (parsed.branch) {
        setBranch(parsed.branch);
      }
    } catch (error) {
      console.warn('Failed to parse saved GitHub connection:', error);
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!owner || !repo) return;

    const payload = JSON.stringify({ repo: `${owner}/${repo}`, branch });
    window.localStorage.setItem(storageKey, payload);
  }, [branch, owner, repo, storageKey]);

  const logStatus = useCallback((message: string, level: StatusLevel = 'info') => {
    setStatusLog((prev) => [{ id: generateId(), message, level, timestamp: new Date() }, ...prev].slice(0, 50));
  }, []);

  const startOperation = useCallback((label: string) => {
    const id = generateId();
    const entry: OperationEntry = {
      id,
      label,
      status: 'running',
      startedAt: new Date(),
    };
    setOperations((prev) => [entry, ...prev].slice(0, 40));
    return id;
  }, []);

  const finishOperation = useCallback((id: string, status: OperationStatus, message?: string) => {
    setOperations((prev) =>
      prev.map((operation) =>
        operation.id === id
          ? {
              ...operation,
              status,
              finishedAt: new Date(),
              message: message ?? operation.message,
            }
          : operation
      )
    );
  }, []);

  const updateOperationProgress = useCallback((id: string, progress: { current: number; total?: number }) => {
    setOperations((prev) =>
      prev.map((operation) => (operation.id === id ? { ...operation, progress } : operation))
    );
  }, []);

  const resetSessionTracking = useCallback(() => {
    setTrackedEdits({});
    setCommittedPaths([]);
    setSessionLinesChanged(0);
  }, []);

  const request = useCallback(
    async <T,>(path: string, init: RequestInit = {}) => {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };

      if (token.trim()) {
        headers.Authorization = `Bearer ${token.trim()}`;
      }

      if (init.body && !(init.headers && 'Content-Type' in init.headers)) {
        headers['Content-Type'] = 'application/json';
      }

      const response = await fetch(`${GITHUB_API_URL}${path}`, {
        ...init,
        headers,
      });

      const text = await response.text();

      if (!response.ok) {
        let message = response.statusText;
        try {
          const data = text ? JSON.parse(text) : null;
          if (data?.message) {
            message = data.message;
          }
        } catch (error) {
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
      } catch (error) {
        throw new Error('Unable to parse GitHub response');
      }
    },
    [token]
  );

  const calculateRepositoryLineCount = useCallback(
    async (branchOverride?: string) => {
      if (!owner || !repo) return false;
      const activeBranch = branchOverride ?? branch;
      if (!activeBranch) return false;

      const operationId = startOperation(`Analyzing ${activeBranch} line count`);
      setLineCountStatus('loading');
      setLineCountError(null);
      logStatus(`Calculating repository line count for ${activeBranch}...`);

      try {
        const branchInfo = await request<{ commit?: { sha?: string } }>(
          `/repos/${owner}/${repo}/branches/${encodeURIComponent(activeBranch)}`
        );
        const commitSha = branchInfo?.commit?.sha;
        if (!commitSha) {
          throw new Error('Unable to resolve branch head for line count analysis');
        }

        const tree = await request<{ tree: { path: string; type: string; sha: string }[] }>(
          `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`
        );
        const blobs = tree?.tree?.filter((item) => item.type === 'blob') ?? [];
        const limitedBlobs = blobs.slice(0, MAX_LINE_COUNT_BLOBS);

        let processed = 0;
        let totalLinesAccumulated = 0;
        for (const blob of limitedBlobs) {
          const blobData = await request<{ content?: string; encoding?: string }>(
            `/repos/${owner}/${repo}/git/blobs/${blob.sha}`
          );
          if (!blobData?.content || blobData.encoding !== 'base64') {
            continue;
          }
          const decoded = decodeContent(blobData.content);
          if (isProbablyBinary(decoded)) {
            continue;
          }
          totalLinesAccumulated += countLines(decoded);
          processed += 1;
          updateOperationProgress(operationId, { current: processed, total: limitedBlobs.length });
          if (processed % 50 === 0) {
            logStatus(`Line count progress: ${processed}/${limitedBlobs.length} files processed.`);
          }
        }

        if (blobs.length > limitedBlobs.length) {
          logStatus(`Line count limited to first ${limitedBlobs.length} files for performance.`, 'info');
        }

        setTotalLineCount(totalLinesAccumulated);
        setLineCountStatus('idle');
        finishOperation(operationId, 'success');
        logStatus(`Estimated repository line count: ${totalLinesAccumulated.toLocaleString()} lines.`, 'success');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to calculate repository lines';
        setLineCountStatus('error');
        setLineCountError(message);
        finishOperation(operationId, 'error', message);
        logStatus(message, 'error');
        return false;
      }
    },
    [branch, finishOperation, logStatus, owner, repo, request, startOperation, updateOperationProgress]
  );

  const loadCommits = useCallback(
    async (targetBranch?: string) => {
      if (!owner || !repo) return false;
      const branchToLoad = targetBranch ?? branch;
      if (!branchToLoad) return false;

      const operationId = startOperation(`Fetching commits (${branchToLoad})`);
      setIsLoadingCommits(true);
      try {
        const data = await request<any[]>(
          `/repos/${owner}/${repo}/commits?sha=${encodeURIComponent(branchToLoad)}&per_page=10`
        );
        const mapped = (data ?? []).map((commit) => ({
          sha: commit.sha,
          message: commit.commit?.message?.split('\n')[0] ?? 'Commit',
          authorName: commit.commit?.author?.name ?? commit.author?.login ?? 'Unknown author',
          date: commit.commit?.author?.date ?? '',
          url: commit.html_url,
        }));
        setCommits(mapped);
        finishOperation(operationId, 'success');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load commits';
        finishOperation(operationId, 'error', message);
        logStatus(message, 'error');
        return false;
      } finally {
        setIsLoadingCommits(false);
      }
    },
    [branch, finishOperation, logStatus, owner, repo, request, startOperation]
  );

  const loadContents = useCallback(
    async (path: string, options?: { branchOverride?: string }) => {
      if (!owner || !repo) return false;
      const activeBranch = options?.branchOverride ?? branch;
      if (!activeBranch) return false;

      const operationId = startOperation(`Loading ${path || 'repository root'}`);
      setIsLoadingContents(true);
      try {
        const encodedPath = path ? `/${encodePath(path)}` : '';
        const data = await request<GitHubContent | GitHubContent[]>(
          `/repos/${owner}/${repo}/contents${encodedPath}?ref=${encodeURIComponent(activeBranch)}`
        );

        const items = Array.isArray(data) ? data : data ? [data] : [];
        const sorted = [...items].sort((a, b) => {
          if (a.type === b.type) {
            return a.name.localeCompare(b.name);
          }
          return a.type === 'dir' ? -1 : 1;
        });

        setContents(sorted);
        setCurrentPath(path);
        finishOperation(operationId, 'success');
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load repository contents';
        finishOperation(operationId, 'error', message);
        logStatus(message, 'error');
        return false;
      } finally {
        setIsLoadingContents(false);
      }
    },
    [branch, finishOperation, logStatus, owner, repo, request, startOperation]
  );

  const loadFile = useCallback(
    async (path: string) => {
      if (!owner || !repo || !branch) return;
      const operationId = startOperation(`Opening ${path}`);

      try {
        const encodedPath = encodePath(path);
        const data = await request<GitHubFileResponse>(
          `/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`
        );

        if (!data || data.type !== 'file') {
          throw new Error('Selected item is not a file');
        }

        const decoded = decodeContent(data.content);
        setSelectedFile({
          path: data.path,
          sha: data.sha,
          content: decoded,
          originalContent: decoded,
        });
        setCommitMessage(`Update ${data.name}`);
        setTrackedEdits((prev) => ({
          ...prev,
          [data.path]: prev[data.path] ?? { isDirty: false, lineDelta: 0 },
        }));
        finishOperation(operationId, 'success');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load file';
        finishOperation(operationId, 'error', message);
        logStatus(message, 'error');
      }
    },
    [branch, finishOperation, logStatus, owner, repo, request, startOperation]
  );

  const handleConnect = useCallback(async () => {
    if (!repoInput.includes('/')) {
      toast({
        title: 'Repository format',
        description: 'Use the format owner/repository.',
        variant: 'destructive',
      });
      return;
    }

    const [ownerInput, repoName] = repoInput.split('/').map((part) => part.trim());
    if (!ownerInput || !repoName) {
      toast({
        title: 'Repository format',
        description: 'Use the format owner/repository.',
        variant: 'destructive',
      });
      return;
    }

    const operationId = startOperation(`Connecting to ${ownerInput}/${repoName}`);
    setConnectionState('connecting');
    logStatus(`Connecting to ${ownerInput}/${repoName}...`);

    try {
      const repository = await request<RepoInfo>(`/repos/${ownerInput}/${repoName}`);
      const branchData = await request<BranchInfo[]>(`/repos/${ownerInput}/${repoName}/branches?per_page=100`);
      const branchNames = (branchData ?? []).map((item) => item.name);
      const defaultBranch = branchNames.includes(repository.default_branch)
        ? repository.default_branch
        : branchNames[0];

      setOwner(ownerInput);
      setRepo(repoName);
      setRepoInfo(repository);
      setBranches(branchNames);
      setBranch(defaultBranch ?? '');
      setConnectionState('connected');
      resetSessionTracking();
      logStatus(`Connected to ${repository.full_name}`, 'success');

      const branchToLoad = defaultBranch ?? branchNames[0] ?? repository.default_branch;
      const [contentsLoaded, commitsLoaded] = await Promise.all([
        loadContents('', { branchOverride: branchToLoad }),
        loadCommits(branchToLoad),
      ]);
      const lineCountLoaded = await calculateRepositoryLineCount(branchToLoad);

      if (contentsLoaded && commitsLoaded && lineCountLoaded) {
        finishOperation(operationId, 'success');
      } else {
        finishOperation(operationId, 'error', 'Some repository data failed to load completely');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to connect to repository';
      logStatus(message, 'error');
      setConnectionState('error');
      finishOperation(operationId, 'error', message);
      toast({ title: 'GitHub error', description: message, variant: 'destructive' });
    }
  }, [calculateRepositoryLineCount, loadCommits, loadContents, repoInput, request, resetSessionTracking, startOperation, toast]);

  const handleSelectBranch = useCallback(
    async (value: string) => {
      setBranch(value);
      setSelectedFile(null);
      setCommitMessage('');
      resetSessionTracking();
      const [contentsLoaded, commitsLoaded] = await Promise.all([
        loadContents(currentPath, { branchOverride: value }),
        loadCommits(value),
      ]);
      const lineCountLoaded = await calculateRepositoryLineCount(value);
      if (contentsLoaded && commitsLoaded && lineCountLoaded) {
        logStatus(`Switched to branch ${value}`, 'success');
      }
    },
    [calculateRepositoryLineCount, currentPath, loadCommits, loadContents, logStatus, resetSessionTracking]
  );

  const handleOpen = useCallback(
    async (item: GitHubContent) => {
      if (item.type === 'dir') {
        const nextPath = currentPath ? `${currentPath}/${item.name}` : item.name;
        await loadContents(nextPath);
        return;
      }
      await loadFile(item.path);
    },
    [currentPath, loadContents, loadFile]
  );

  const handleNavigateUp = useCallback(async () => {
    if (!currentPath) return;
    const segments = currentPath.split('/');
    segments.pop();
    const nextPath = segments.join('/');
    await loadContents(nextPath);
  }, [currentPath, loadContents]);

  const handleFileChange = useCallback((value: string) => {
    setSelectedFile((prev) => {
      if (!prev) return prev;
      const next = { ...prev, content: value };
      setTrackedEdits((prevEdits) => ({
        ...prevEdits,
        [prev.path]: {
          isDirty: value !== prev.originalContent,
          lineDelta: countLines(value) - countLines(prev.originalContent),
        },
      }));
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !owner || !repo || !branch) return;
    if (!token.trim()) {
      toast({
        title: 'Authentication required',
        description: 'Provide a GitHub personal access token to commit changes.',
        variant: 'destructive',
      });
      return;
    }

    const message = commitMessage.trim() || `Update ${selectedFile.path}`;
    const operationId = startOperation(`Committing ${selectedFile.path}`);
    setIsSaving(true);
    logStatus(`Committing ${selectedFile.path} to ${branch}...`);

    const trackedDelta = trackedEdits[selectedFile.path]?.lineDelta ?? 0;

    try {
      const body = {
        message,
        content: encodeContent(selectedFile.content),
        sha: selectedFile.sha,
        branch,
      };

      const response = await request<{ content?: { sha: string } }>(
        `/repos/${owner}/${repo}/contents/${encodePath(selectedFile.path)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        }
      );

      const nextSha = response?.content?.sha ?? selectedFile.sha;
      setSelectedFile((prev) =>
        prev
          ? {
              ...prev,
              sha: nextSha,
              originalContent: prev.content,
            }
          : prev
      );
      setCommitMessage('');
      setTrackedEdits((prev) => ({
        ...prev,
        [selectedFile.path]: { isDirty: false, lineDelta: 0 },
      }));
      setCommittedPaths((prev) => (prev.includes(selectedFile.path) ? prev : [...prev, selectedFile.path]));
      setSessionLinesChanged((prev) => prev + Math.abs(trackedDelta));
      logStatus(`Committed ${selectedFile.path}`, 'success');
      finishOperation(operationId, 'success');
      toast({ title: 'Commit created', description: `${selectedFile.path} updated on ${branch}` });
      await Promise.all([loadContents(currentPath), loadCommits()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to commit changes';
      logStatus(message, 'error');
      finishOperation(operationId, 'error', message);
      toast({ title: 'Commit failed', description: message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [branch, commitMessage, currentPath, loadCommits, loadContents, logStatus, owner, repo, request, selectedFile, startOperation, toast, token, trackedEdits, finishOperation]);

  const isConnected = connectionState === 'connected' && !!repoInfo;
  const isDirty = selectedFile ? selectedFile.content !== selectedFile.originalContent : false;
  const sortedContents = useMemo(() => contents, [contents]);
  const breadcrumbs = useMemo(() => {
    if (!currentPath) return [] as string[];
    const segments = currentPath.split('/');
    return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
  }, [currentPath]);
  const runningOperations = useMemo(
    () => operations.filter((operation) => operation.status === 'running'),
    [operations]
  );
  const dirtyFilesCount = useMemo(
    () => Object.values(trackedEdits).filter((entry) => entry.isDirty).length,
    [trackedEdits]
  );
  const pendingLines = useMemo(
    () =>
      Object.values(trackedEdits).reduce(
        (accumulator, entry) => (entry.isDirty ? accumulator + Math.abs(entry.lineDelta) : accumulator),
        0
      ),
    [trackedEdits]
  );
  const operationsToDisplay = useMemo(() => operations.slice(0, 8), [operations]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Link2 className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold tracking-tight">GitHub Automation Workspace</h1>
                <p className="text-sm text-muted-foreground">Agent session: {agentName}</p>
              </div>
            </div>
            <p className="max-w-2xl text-muted-foreground">
              Connect to a GitHub repository, inspect the file system, edit code, and push commits directly from the
              browser. All operations use the live GitHub REST API — no simulations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-2">
              <Bot className="h-4 w-4" />
              {agentName}
            </Badge>
            {isConnected && (
              <Badge variant="outline" className="gap-2">
                <GitBranch className="h-4 w-4" />
                {branch}
              </Badge>
            )}
            {isConnected && (
              <Badge variant="outline" className="gap-2">
                <GitCommit className="h-4 w-4" />
                {commits[0]?.sha.slice(0, 7) ?? '—'}
              </Badge>
            )}
            {runningOperations.length > 0 && (
              <Badge variant="outline" className="gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                {runningOperations.length} running
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`repo-${agentId}`}>Repository (owner/name)</Label>
                <Input
                  id={`repo-${agentId}`}
                  placeholder="openai/openai"
                  value={repoInput}
                  onChange={(event) => setRepoInput(event.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`token-${agentId}`}>Personal access token (optional for read-only)</Label>
                <Input
                  id={`token-${agentId}`}
                  type="password"
                  placeholder="ghp_..."
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={handleConnect} disabled={connectionState === 'connecting'}>
                {connectionState === 'connecting' ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Connecting…
                  </span>
                ) : (
                  'Connect to GitHub'
                )}
              </Button>

              {isConnected && (
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-success" /> Connected to {repoInfo?.full_name}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" /> Last push {repoInfo?.pushed_at ? formatDate(repoInfo.pushed_at) : '—'}
                  </span>
                </div>
              )}
            </div>
          </Card>

          {isConnected && (
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <Folder className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold">Repository explorer</h2>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                  onClick={() => loadContents('')}
                >
                  <ArrowLeft className="h-4 w-4" /> Root
                </button>
                {breadcrumbs.map((crumb, index) => (
                  <button
                    key={crumb}
                    type="button"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    onClick={() => loadContents(crumb)}
                  >
                    {index === breadcrumbs.length - 1 ? crumb.split('/').pop() : `${crumb.split('/').pop()} /`}
                  </button>
                ))}
              </div>

              <div className="mt-4 flex flex-col gap-4 lg:flex-row">
                <div className="w-full lg:w-64">
                  <Label htmlFor={`branch-${agentId}`}>Branch</Label>
                  <select
                    id={`branch-${agentId}`}
                    className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    value={branch}
                    onChange={(event) => handleSelectBranch(event.target.value)}
                  >
                    {branches.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex-1">
                  <Label>Contents</Label>
                  <ScrollArea className="mt-2 h-[320px] rounded-md border border-border/60">
                    {isLoadingContents ? (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading contents…
                      </div>
                    ) : sortedContents.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        Repository is empty.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/60">
                        {currentPath && (
                          <button
                            className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                            onClick={handleNavigateUp}
                          >
                            <Folder className="h-5 w-5" />
                            <div>
                              <p className="font-medium">.. (up)</p>
                              <p className="text-xs text-muted-foreground">Navigate to parent directory</p>
                            </div>
                          </button>
                        )}
                        {sortedContents.map((item) => (
                          <button
                            key={item.sha}
                            className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40"
                            onClick={() => handleOpen(item)}
                          >
                            {item.type === 'dir' ? (
                              <Folder className="h-5 w-5 text-primary" />
                            ) : (
                              <FileCode className="h-5 w-5 text-primary" />
                            )}
                            <div>
                              <p className="font-medium">{item.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {item.type === 'dir' ? 'Directory' : `${item.size} bytes`}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </Card>
          )}

          {isConnected && (
            <Card className="border border-border/60 bg-muted/10 p-4">
              {selectedFile ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedFile.path}</h3>
                      <p className="text-xs text-muted-foreground">SHA: {selectedFile.sha}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {isDirty && <Badge variant="destructive">Unsaved changes</Badge>}
                      {trackedEdits[selectedFile.path]?.lineDelta && (
                        <Badge variant="outline" className="gap-1">
                          <Sigma className="h-3 w-3" />
                          {trackedEdits[selectedFile.path]?.lineDelta > 0 ? '+' : ''}
                          {trackedEdits[selectedFile.path]?.lineDelta}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <Textarea
                    className="h-[240px] font-mono text-sm"
                    value={selectedFile.content}
                    onChange={(event) => handleFileChange(event.target.value)}
                  />

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                    <div className="space-y-2">
                      <Label htmlFor={`commit-message-${agentId}`}>Commit message</Label>
                      <Input
                        id={`commit-message-${agentId}`}
                        placeholder={`Update ${selectedFile.path}`}
                        value={commitMessage}
                        onChange={(event) => setCommitMessage(event.target.value)}
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <Button className="w-full" onClick={handleSave} disabled={!isDirty || isSaving}>
                        {isSaving ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Save className="h-4 w-4" /> Commit changes
                          </span>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={() => calculateRepositoryLineCount()}
                        disabled={lineCountStatus === 'loading'}
                      >
                        {lineCountStatus === 'loading' ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Recounting…
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2">
                            <Sigma className="h-4 w-4" /> Recalculate lines
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                  <FileCode className="h-10 w-10" />
                  <p>Select a file to start editing.</p>
                  <p className="text-xs">Changes are committed directly to GitHub when you save.</p>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Live operations</h2>
            </div>

            <div className="mt-4">
              {operationsToDisplay.length === 0 ? (
                <div className="flex h-[180px] items-center justify-center text-muted-foreground">
                  No operations yet. Interact with the repository to see live activity.
                </div>
              ) : (
                <div className="space-y-3">
                  {operationsToDisplay.map((operation) => {
                    const isRunning = operation.status === 'running';
                    const statusLabel =
                      operation.status === 'running' ? 'Running' : operation.status === 'success' ? 'Completed' : 'Error';
                    const Icon = isRunning ? Loader2 : operation.status === 'success' ? CheckCircle : AlertCircle;
                    const progressPercentage = operation.progress?.total
                      ? Math.min(100, Math.round((operation.progress.current / operation.progress.total) * 100))
                      : null;

                    return (
                      <div key={operation.id} className="rounded-lg border border-border/60 p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Icon
                              className={`h-4 w-4 ${
                                operation.status === 'success'
                                  ? 'text-success'
                                  : operation.status === 'error'
                                  ? 'text-destructive'
                                  : 'text-primary'
                              } ${isRunning ? 'animate-spin' : ''}`}
                            />
                            <div>
                              <p className="font-medium">{operation.label}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(operation.startedAt)}</p>
                            </div>
                          </div>
                          <Badge variant="outline">{statusLabel}</Badge>
                        </div>
                        {operation.message && operation.status === 'error' && (
                          <p className="mt-2 text-xs text-destructive">{operation.message}</p>
                        )}
                        {progressPercentage !== null && (
                          <div className="mt-3 space-y-1">
                            <Progress value={progressPercentage} />
                            <p className="text-xs text-muted-foreground">
                              {operation.progress?.current ?? 0}/{operation.progress?.total ?? 0} items processed
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <FileDiff className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Change metrics</h2>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dirty files</span>
                  <Badge variant="outline">{dirtyFilesCount}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold">{dirtyFilesCount}</p>
                <p className="text-xs text-muted-foreground">Files with unsaved changes</p>
              </div>

              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Files committed</span>
                  <Badge variant="outline">{committedPaths.length}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold">{committedPaths.length}</p>
                <p className="text-xs text-muted-foreground">Committed during this session</p>
              </div>

              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Lines committed</span>
                  <Badge variant="outline">{sessionLinesChanged}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold">{sessionLinesChanged}</p>
                <p className="text-xs text-muted-foreground">Absolute line delta pushed via this agent</p>
              </div>

              <div className="rounded-lg border border-border/60 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Pending line changes</span>
                  <Badge variant="outline">{pendingLines}</Badge>
                </div>
                <p className="mt-2 text-2xl font-semibold">{pendingLines}</p>
                <p className="text-xs text-muted-foreground">Unsaved lines waiting to commit</p>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-dashed border-border/60 p-4">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Sigma className="h-4 w-4" /> Estimated repository line count
                </span>
                {lineCountStatus === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : lineCountStatus === 'error' ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle className="h-4 w-4 text-success" />
                )}
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {totalLineCount !== null ? totalLineCount.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-muted-foreground">
                {lineCountStatus === 'error' && lineCountError
                  ? lineCountError
                  : 'Calculated from the most recent branch snapshot (limited to first 400 files for performance).'}
              </p>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <GitCommit className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Recent commits</h2>
            </div>

            <ScrollArea className="mt-4 h-[260px]">
              {isLoadingCommits ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading commits…
                </div>
              ) : commits.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">No commits retrieved yet.</div>
              ) : (
                <div className="space-y-4">
                  {commits.map((commit) => (
                    <div key={commit.sha} className="rounded-lg border border-border/60 p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs">{commit.sha.slice(0, 7)}</span>
                        <a
                          href={commit.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <p className="mt-2 font-medium">{commit.message}</p>
                      <p className="text-xs text-muted-foreground">{commit.authorName} • {formatDate(commit.date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">Activity log</h2>
            </div>

            <ScrollArea className="mt-4 h-[260px]">
              {statusLog.length === 0 ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  Interact with the repository to see live activity here.
                </div>
              ) : (
                <div className="space-y-3">
                  {statusLog.map((entry) => (
                    <div key={entry.id} className="rounded-lg border border-border/60 p-3 text-sm">
                      <div className="flex items-start gap-3">
                        {entry.level === 'success' ? (
                          <CheckCircle className="mt-1 h-4 w-4 text-success" />
                        ) : entry.level === 'error' ? (
                          <AlertCircle className="mt-1 h-4 w-4 text-destructive" />
                        ) : (
                          <Clock className="mt-1 h-4 w-4 text-muted-foreground" />
                        )}
                        <div>
                          <p className="font-medium">{entry.message}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(entry.timestamp)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </Card>
        </div>
      </div>
    </div>
  );
};

interface AgentDescriptor {
  id: string;
  name: string;
}

export const AutonomousAgent: React.FC = () => {
  const [agents, setAgents] = useState<AgentDescriptor[]>(() => {
    const initialId = generateId();
    return [{ id: initialId, name: 'Agent 1' }];
  });
  const [activeAgentId, setActiveAgentId] = useState(() => {
    const initialId = agents[0]?.id ?? '';
    return initialId;
  });

  useEffect(() => {
    if (agents.length === 0) {
      const fallbackId = generateId();
      setAgents([{ id: fallbackId, name: 'Agent 1' }]);
      setActiveAgentId(fallbackId);
      return;
    }

    if (!agents.some((agent) => agent.id === activeAgentId)) {
      setActiveAgentId(agents[agents.length - 1]?.id ?? agents[0].id);
    }
  }, [activeAgentId, agents]);

  const handleAddAgent = useCallback(() => {
    setAgents((prev) => {
      const next = [...prev, { id: generateId(), name: `Agent ${prev.length + 1}` }];
      setActiveAgentId(next[next.length - 1].id);
      return next;
    });
  }, []);

  const handleRemoveAgent = useCallback(
    (id: string) => {
      setAgents((prev) => {
        if (prev.length === 1) {
          return prev;
        }
        const next = prev.filter((agent) => agent.id !== id);
        if (next.length > 0 && !next.some((agent) => agent.id === activeAgentId)) {
          setActiveAgentId(next[next.length - 1].id);
        }
        return next;
      });
    },
    [activeAgentId]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="container mx-auto px-6 py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Autonomous Agents Control Center</h1>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Spin up multiple GitHub-connected agents, monitor their live operations, and keep an eye on repository
                impact in real time.
              </p>
            </div>
            <Badge variant="outline" className="gap-2">
              <Bot className="h-4 w-4" /> {agents.length} active {agents.length === 1 ? 'agent' : 'agents'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-8">
        <Tabs value={activeAgentId} onValueChange={setActiveAgentId} className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <TabsList className="flex flex-wrap items-center gap-2">
              {agents.map((agent) => (
                <TabsTrigger key={agent.id} value={agent.id} className="relative pr-8">
                  {agent.name}
                  {agents.length > 1 && (
                    <button
                      type="button"
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRemoveAgent(agent.id);
                      }}
                      aria-label={`Close ${agent.name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button variant="outline" size="sm" className="inline-flex items-center gap-2" onClick={handleAddAgent}>
              <Plus className="h-4 w-4" /> Add agent
            </Button>
          </div>

          {agents.map((agent) => (
            <TabsContent key={agent.id} value={agent.id} className="space-y-6">
              <AgentWorkspace agentId={agent.id} agentName={agent.name} />
            </TabsContent>
          ))}
        </Tabs>
      </main>
    </div>
  );
};

export default AutonomousAgent;

