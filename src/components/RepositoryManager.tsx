import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  GitBranch,
  Plus,
  Settings,
  Trash2,
  Loader2,
  CheckCircle,
  Clock,
  Webhook,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/auth/useAuth';

interface RegisteredRepository {
  id: string;
  repo_owner: string;
  repo_name: string;
  full_name: string;
  default_branch: string;
  auto_apply_enabled: boolean;
  auto_fix_todos: boolean;
  auto_fix_quality_issues: boolean;
  auto_respond_to_issues: boolean;
  auto_review_prs: boolean;
  monitoring_enabled: boolean;
  scan_frequency: string;
  last_scanned_at: string | null;
  webhook_configured: boolean;
  created_at: string;
}

interface RepositoryManagerProps {
  installationId: string | null;
  githubToken: string | null;
}

export const RepositoryManager = ({ installationId, githubToken }: RepositoryManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [repositories, setRepositories] = useState<RegisteredRepository[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState<RegisteredRepository | null>(null);

  // New repo form state
  const [newRepoOwner, setNewRepoOwner] = useState('');
  const [newRepoName, setNewRepoName] = useState('');
  const [newDefaultBranch, setNewDefaultBranch] = useState('main');

  const fetchRepositories = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Use raw query to avoid type issues with unsynced tables
      const { data, error } = await supabase
        .rpc('get_user_repositories' as never, { p_user_id: user.id } as never)
        .returns<RegisteredRepository[]>();

      if (error) {
        // Fallback: try direct query if RPC doesn't exist
        const fallbackResult = await supabase
          .from('registered_repositories' as 'tasks')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (fallbackResult.error) throw fallbackResult.error;
        setRepositories((fallbackResult.data || []) as unknown as RegisteredRepository[]);
        return;
      }

      setRepositories(data || []);
    } catch (error) {
      console.error('Failed to fetch repositories:', error);
      toast({
        title: 'Error',
        description: 'Failed to load registered repositories',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    fetchRepositories();
  }, [fetchRepositories]);

  const handleAddRepository = async () => {
    if (!user?.id || !installationId) return;

    const fullName = `${newRepoOwner}/${newRepoName}`;

    setIsAdding(true);
    try {
      const { error } = await supabase.from('registered_repositories' as 'tasks').insert({
        user_id: user.id,
        installation_id: installationId,
        repo_owner: newRepoOwner.trim(),
        repo_name: newRepoName.trim(),
        full_name: fullName,
        default_branch: newDefaultBranch.trim(),
        auto_apply_enabled: false,
        auto_fix_todos: true,
        auto_fix_quality_issues: true,
        auto_respond_to_issues: false,
        auto_review_prs: false,
        monitoring_enabled: true,
        scan_frequency: 'daily',
      } as never);

      if (error) throw error;

      toast({
        title: 'Repository registered',
        description: `${fullName} is now being monitored autonomously`,
      });

      setIsAddDialogOpen(false);
      setNewRepoOwner('');
      setNewRepoName('');
      setNewDefaultBranch('main');
      await fetchRepositories();
    } catch (error) {
      console.error('Failed to add repository:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to register repository',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteRepository = async (repoId: string) => {
    try {
      const { error } = await supabase
        .from('registered_repositories' as 'tasks')
        .delete()
        .eq('id', repoId);

      if (error) throw error;

      toast({
        title: 'Repository removed',
        description: 'Repository has been unregistered from autonomous monitoring',
      });

      await fetchRepositories();
    } catch (error) {
      console.error('Failed to delete repository:', error);
      toast({
        title: 'Error',
        description: 'Failed to remove repository',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateRepository = async (
    repoId: string,
    updates: Partial<RegisteredRepository>
  ) => {
    try {
      const { error } = await supabase
        .from('registered_repositories' as 'tasks')
        .update(updates as never)
        .eq('id', repoId);

      if (error) throw error;

      await fetchRepositories();
    } catch (error) {
      console.error('Failed to update repository:', error);
      toast({
        title: 'Error',
        description: 'Failed to update repository settings',
        variant: 'destructive',
      });
    }
  };

  const handleTriggerScan = async (repoId: string) => {
    try {
      const { error } = await supabase.functions.invoke('scheduled-scan', {
        body: { repo_id: repoId },
      });

      if (error) throw error;

      toast({
        title: 'Scan triggered',
        description: 'Repository scan has been initiated',
      });
    } catch (error) {
      console.error('Failed to trigger scan:', error);
      toast({
        title: 'Error',
        description: 'Failed to trigger repository scan',
        variant: 'destructive',
      });
    }
  };

  if (!githubToken) {
    return (
      <Alert>
        <AlertDescription>
          Sign in with GitHub to manage autonomous repository monitoring
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Autonomous Repositories</h2>
          <p className="text-sm text-muted-foreground">
            Register repositories for continuous autonomous improvement
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Register Repository
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Register New Repository</DialogTitle>
              <DialogDescription>
                Add a repository to enable autonomous monitoring and improvements
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="owner">Owner</Label>
                  <Input
                    id="owner"
                    placeholder="octocat"
                    value={newRepoOwner}
                    onChange={(e) => setNewRepoOwner(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Repository Name</Label>
                  <Input
                    id="name"
                    placeholder="hello-world"
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch">Default Branch</Label>
                <Input
                  id="branch"
                  placeholder="main"
                  value={newDefaultBranch}
                  onChange={(e) => setNewDefaultBranch(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAddRepository}
                disabled={isAdding || !newRepoOwner || !newRepoName}
              >
                {isAdding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Register
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : repositories.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">No repositories registered yet</p>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Register Your First Repository
          </Button>
        </Card>
      ) : (
        <ScrollArea className="h-[600px]">
          <div className="space-y-4">
            {repositories.map((repo) => (
              <Card key={repo.id} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold">{repo.full_name}</h3>
                      {repo.monitoring_enabled ? (
                        <Badge variant="default" className="gap-1">
                          <Zap className="h-3 w-3" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Paused</Badge>
                      )}
                      {repo.auto_apply_enabled && (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Auto-apply
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {repo.default_branch}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {repo.scan_frequency}
                      </div>
                      {repo.webhook_configured && (
                        <div className="flex items-center gap-1">
                          <Webhook className="h-3 w-3" />
                          Webhook active
                        </div>
                      )}
                    </div>
                    {repo.last_scanned_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Last scanned: {new Date(repo.last_scanned_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleTriggerScan(repo.id)}
                    >
                      Scan Now
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedRepo(repo)}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteRepository(repo.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Fix TODOs</Label>
                    <Switch
                      checked={repo.auto_fix_todos}
                      onCheckedChange={(checked) =>
                        handleUpdateRepository(repo.id, { auto_fix_todos: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Fix Quality</Label>
                    <Switch
                      checked={repo.auto_fix_quality_issues}
                      onCheckedChange={(checked) =>
                        handleUpdateRepository(repo.id, { auto_fix_quality_issues: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Respond to Issues</Label>
                    <Switch
                      checked={repo.auto_respond_to_issues}
                      onCheckedChange={(checked) =>
                        handleUpdateRepository(repo.id, { auto_respond_to_issues: checked })
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Review PRs</Label>
                    <Switch
                      checked={repo.auto_review_prs}
                      onCheckedChange={(checked) =>
                        handleUpdateRepository(repo.id, { auto_review_prs: checked })
                      }
                    />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Settings Dialog */}
      <Dialog open={Boolean(selectedRepo)} onOpenChange={() => setSelectedRepo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repository Settings</DialogTitle>
            <DialogDescription>{selectedRepo?.full_name}</DialogDescription>
          </DialogHeader>
          {selectedRepo && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Monitoring Enabled</Label>
                <Switch
                  checked={selectedRepo.monitoring_enabled}
                  onCheckedChange={(checked) =>
                    handleUpdateRepository(selectedRepo.id, { monitoring_enabled: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Auto-apply Changes</Label>
                <Switch
                  checked={selectedRepo.auto_apply_enabled}
                  onCheckedChange={(checked) =>
                    handleUpdateRepository(selectedRepo.id, { auto_apply_enabled: checked })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Scan Frequency</Label>
                <Select
                  value={selectedRepo.scan_frequency}
                  onValueChange={(value) =>
                    handleUpdateRepository(selectedRepo.id, { scan_frequency: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hourly">Hourly</SelectItem>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default Branch</Label>
                <Input
                  value={selectedRepo.default_branch}
                  onChange={(e) =>
                    handleUpdateRepository(selectedRepo.id, { default_branch: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setSelectedRepo(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
