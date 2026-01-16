import { Card } from '@/components/ui/card';
import { RepositoryManager } from '@/components/RepositoryManager';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/useAuth';
import { useGithubOAuth } from '@/hooks/useGithubOAuth';
import { ArrowLeft, Loader2, Github, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function AutonomousRepositories() {
  const { session, user } = useAuth();
  const { installation, isLoading, error, hasGithubAuth } = useGithubOAuth(session);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Authentication Required</h2>
          <p className="text-muted-foreground mb-4">
            Please sign in to manage autonomous repositories
          </p>
          <Button asChild>
            <Link to="/">Go to Sign In</Link>
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading GitHub configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-background">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to="/agent">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Autonomous Repositories
              </h1>
              <p className="text-muted-foreground mt-1">
                Manage repositories for continuous autonomous building and improvement
              </p>
            </div>
          </div>
        </div>

        {/* GitHub Auth Status */}
        {!hasGithubAuth ? (
          <Alert>
            <Github className="h-4 w-4" />
            <AlertTitle>GitHub OAuth Not Connected</AlertTitle>
            <AlertDescription>
              To enable autonomous repository monitoring, please sign in with GitHub. This provides
              secure OAuth access to your repositories without requiring manual token entry.
              <div className="mt-4">
                <Button asChild variant="default">
                  <Link to="/">
                    <Github className="h-4 w-4 mr-2" />
                    Sign In with GitHub
                  </Link>
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : (
          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                <Github className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold">Connected to GitHub</h3>
                <p className="text-sm text-muted-foreground">
                  Signed in as <span className="font-medium">{installation?.github_username}</span>
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Repository Manager */}
        <Card className="p-6">
          <RepositoryManager
            installationId={installation?.id || null}
            githubToken={installation?.access_token || null}
          />
        </Card>

        {/* Info Section */}
        <Card className="p-6 bg-muted/30">
          <h3 className="font-semibold mb-3">How Autonomous Building Works</h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>1. Webhook Triggers:</strong> When you push code, open issues, or create PRs,
              AutoDidact automatically analyzes and responds based on your configured settings.
            </p>
            <p>
              <strong>2. Scheduled Scans:</strong> AutoDidact periodically scans your repositories
              for TODO comments, code quality issues, and improvement opportunities.
            </p>
            <p>
              <strong>3. Autonomous Actions:</strong> Based on your preferences, AutoDidact can
              automatically fix issues, implement TODOs, review PRs, and more.
            </p>
            <p>
              <strong>4. Safety First:</strong> Auto-apply is disabled by default. Review changes
              before enabling automatic commits to your repositories.
            </p>
          </div>
          <div className="mt-4">
            <Button variant="outline" asChild>
              <a
                href="https://github.com/yourusername/autodidact-builder/blob/main/AUTONOMOUS_SETUP.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Setup Guide
              </a>
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
