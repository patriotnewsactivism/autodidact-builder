/**
 * Enhanced GitHub Operations Utility
 *
 * Provides comprehensive GitHub integration including:
 * - 2-way sync (pull before push, conflict detection)
 * - Branch management (create, switch, merge)
 * - PR creation and management
 * - Commit history and diffs
 * - Conflict resolution assistance
 */

export class GitHubOperationsError extends Error {
  constructor(
    message: string,
    public code: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'GitHubOperationsError';
  }
}

export interface GitHubConfig {
  owner: string;
  repo: string;
  token: string;
}

export interface Branch {
  name: string;
  sha: string;
  protected: boolean;
}

export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
}

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'removed';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface PullRequest {
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  mergeable: boolean | null;
  merged: boolean;
}

export interface ConflictInfo {
  hasConflicts: boolean;
  conflictingFiles: string[];
  behindBy: number;
  aheadBy: number;
}

const GITHUB_API_BASE = 'https://api.github.com';

export class GitHubOperations {
  constructor(private config: GitHubConfig) {}

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${GITHUB_API_BASE}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.config.token}`);
    headers.set('Accept', 'application/vnd.github+json');
    headers.set('X-GitHub-Api-Version', '2022-11-28');

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const text = await response.text();

    if (!response.ok) {
      let message = response.statusText || 'GitHub API request failed';
      let details: unknown = null;

      if (text) {
        try {
          const data = JSON.parse(text);
          message = data.message || message;
          details = data;
        } catch {
          message = text;
        }
      }

      throw new GitHubOperationsError(
        message,
        response.status === 404 ? 'NOT_FOUND' :
        response.status === 403 ? 'FORBIDDEN' :
        response.status === 422 ? 'VALIDATION_FAILED' :
        'API_ERROR',
        response.status,
        details
      );
    }

    if (!text) {
      return null as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new GitHubOperationsError(
        'Invalid JSON response from GitHub API',
        'PARSE_ERROR'
      );
    }
  }

  /**
   * Get repository information including permissions
   */
  async getRepository() {
    return this.request<{
      id: number;
      name: string;
      full_name: string;
      default_branch: string;
      permissions: {
        admin: boolean;
        push: boolean;
        pull: boolean;
      };
      private: boolean;
    }>(`/repos/${this.config.owner}/${this.config.repo}`);
  }

  /**
   * List all branches in the repository
   */
  async listBranches(): Promise<Branch[]> {
    const branches = await this.request<Array<{
      name: string;
      commit: { sha: string };
      protected: boolean;
    }>>(`/repos/${this.config.owner}/${this.config.repo}/branches`);

    return branches.map(b => ({
      name: b.name,
      sha: b.commit.sha,
      protected: b.protected,
    }));
  }

  /**
   * Get a specific branch
   */
  async getBranch(branchName: string): Promise<Branch> {
    const branch = await this.request<{
      name: string;
      commit: { sha: string };
      protected: boolean;
    }>(`/repos/${this.config.owner}/${this.config.repo}/branches/${encodeURIComponent(branchName)}`);

    return {
      name: branch.name,
      sha: branch.commit.sha,
      protected: branch.protected,
    };
  }

  /**
   * Create a new branch from a source branch
   */
  async createBranch(newBranchName: string, fromBranch: string = 'main'): Promise<Branch> {
    // Get the SHA of the source branch
    const sourceBranch = await this.getBranch(fromBranch);

    // Create the new branch reference
    await this.request(`/repos/${this.config.owner}/${this.config.repo}/git/refs`, {
      method: 'POST',
      body: JSON.stringify({
        ref: `refs/heads/${newBranchName}`,
        sha: sourceBranch.sha,
      }),
    });

    return this.getBranch(newBranchName);
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string): Promise<void> {
    await this.request(
      `/repos/${this.config.owner}/${this.config.repo}/git/refs/heads/${encodeURIComponent(branchName)}`,
      { method: 'DELETE' }
    );
  }

  /**
   * Get commits for a branch
   */
  async getCommits(branch: string, limit: number = 20): Promise<Commit[]> {
    const commits = await this.request<Array<{
      sha: string;
      commit: {
        message: string;
        author: {
          name: string;
          email: string;
          date: string;
        };
      };
      html_url: string;
    }>>(`/repos/${this.config.owner}/${this.config.repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${limit}`);

    return commits.map(c => ({
      sha: c.sha,
      message: c.commit.message,
      author: c.commit.author,
      url: c.html_url,
    }));
  }

  /**
   * Compare two branches to detect conflicts and get diff stats
   */
  async compareBranches(base: string, head: string): Promise<{
    aheadBy: number;
    behindBy: number;
    status: 'identical' | 'ahead' | 'behind' | 'diverged';
    files: FileChange[];
  }> {
    const comparison = await this.request<{
      ahead_by: number;
      behind_by: number;
      status: string;
      files: Array<{
        filename: string;
        status: string;
        additions: number;
        deletions: number;
        changes: number;
        patch?: string;
      }>;
    }>(`/repos/${this.config.owner}/${this.config.repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);

    return {
      aheadBy: comparison.ahead_by,
      behindBy: comparison.behind_by,
      status: comparison.status as 'identical' | 'ahead' | 'behind' | 'diverged',
      files: comparison.files.map(f => ({
        path: f.filename,
        status: f.status as 'added' | 'modified' | 'removed',
        additions: f.additions,
        deletions: f.deletions,
        changes: f.changes,
        patch: f.patch,
      })),
    };
  }

  /**
   * Check for conflicts before pushing
   */
  async checkForConflicts(sourceBranch: string, targetBranch: string): Promise<ConflictInfo> {
    try {
      const comparison = await this.compareBranches(targetBranch, sourceBranch);

      // If we're behind the target, there might be conflicts
      const hasConflicts = comparison.behindBy > 0;
      const conflictingFiles = hasConflicts
        ? comparison.files.map(f => f.path)
        : [];

      return {
        hasConflicts,
        conflictingFiles,
        behindBy: comparison.behindBy,
        aheadBy: comparison.aheadBy,
      };
    } catch (error) {
      throw new GitHubOperationsError(
        `Failed to check for conflicts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CONFLICT_CHECK_FAILED',
        undefined,
        error
      );
    }
  }

  /**
   * Pull latest changes from a branch (get latest commit SHA)
   */
  async pullLatest(branch: string): Promise<{ sha: string; message: string }> {
    const branchData = await this.getBranch(branch);
    const commits = await this.getCommits(branch, 1);

    return {
      sha: branchData.sha,
      message: commits[0]?.message || 'No commits found',
    };
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    title: string,
    head: string,
    base: string,
    body?: string
  ): Promise<PullRequest> {
    const pr = await this.request<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      head: { ref: string; sha: string };
      base: { ref: string; sha: string };
      mergeable: boolean | null;
      merged: boolean;
    }>(`/repos/${this.config.owner}/${this.config.repo}/pulls`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        head,
        base,
        body: body || `Automated pull request created by AutoDidact\n\n## Changes\n${title}`,
      }),
    });

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state as 'open' | 'closed',
      html_url: pr.html_url,
      head: pr.head,
      base: pr.base,
      mergeable: pr.mergeable,
      merged: pr.merged,
    };
  }

  /**
   * Get an existing pull request
   */
  async getPullRequest(prNumber: number): Promise<PullRequest> {
    const pr = await this.request<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      head: { ref: string; sha: string };
      base: { ref: string; sha: string };
      mergeable: boolean | null;
      merged: boolean;
    }>(`/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}`);

    return {
      number: pr.number,
      title: pr.title,
      state: pr.state as 'open' | 'closed',
      html_url: pr.html_url,
      head: pr.head,
      base: pr.base,
      mergeable: pr.mergeable,
      merged: pr.merged,
    };
  }

  /**
   * List open pull requests
   */
  async listPullRequests(state: 'open' | 'closed' | 'all' = 'open'): Promise<PullRequest[]> {
    const prs = await this.request<Array<{
      number: number;
      title: string;
      state: string;
      html_url: string;
      head: { ref: string; sha: string };
      base: { ref: string; sha: string };
      mergeable: boolean | null;
      merged: boolean;
    }>>(`/repos/${this.config.owner}/${this.config.repo}/pulls?state=${state}`);

    return prs.map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state as 'open' | 'closed',
      html_url: pr.html_url,
      head: pr.head,
      base: pr.base,
      mergeable: pr.mergeable,
      merged: pr.merged,
    }));
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    prNumber: number,
    commitTitle?: string,
    commitMessage?: string,
    mergeMethod: 'merge' | 'squash' | 'rebase' = 'merge'
  ): Promise<{ sha: string; merged: boolean; message: string }> {
    const result = await this.request<{
      sha: string;
      merged: boolean;
      message: string;
    }>(`/repos/${this.config.owner}/${this.config.repo}/pulls/${prNumber}/merge`, {
      method: 'PUT',
      body: JSON.stringify({
        commit_title: commitTitle,
        commit_message: commitMessage,
        merge_method: mergeMethod,
      }),
    });

    return result;
  }

  /**
   * Get file content from a specific branch
   */
  async getFileContent(path: string, branch: string): Promise<{
    content: string;
    sha: string;
    encoding: string;
  } | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const data = await this.request<{
        type: string;
        encoding: string;
        content: string;
        sha: string;
      }>(`/repos/${this.config.owner}/${this.config.repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`);

      if (data.type !== 'file') {
        return null;
      }

      // Decode base64 content
      const content = data.encoding === 'base64'
        ? atob(data.content.replace(/\n/g, ''))
        : data.content;

      return {
        content,
        sha: data.sha,
        encoding: data.encoding,
      };
    } catch (error) {
      if (error instanceof GitHubOperationsError && error.code === 'NOT_FOUND') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Sync with remote before making changes (2-way sync)
   * Returns conflict information if any
   */
  async syncBeforePush(
    sourceBranch: string,
    targetBranch: string = 'main'
  ): Promise<{
    needsSync: boolean;
    conflictInfo: ConflictInfo;
    latestSha: string;
  }> {
    // Get latest state of target branch
    const latest = await this.pullLatest(targetBranch);

    // Check for conflicts
    const conflictInfo = await this.checkForConflicts(sourceBranch, targetBranch);

    return {
      needsSync: conflictInfo.behindBy > 0,
      conflictInfo,
      latestSha: latest.sha,
    };
  }
}

/**
 * Create a GitHub operations instance
 */
export function createGitHubOps(config: GitHubConfig): GitHubOperations {
  return new GitHubOperations(config);
}
