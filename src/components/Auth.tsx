import { useCallback, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Sparkles, Github, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useAuth } from '@/auth/useAuth';
import { MISCONFIGURED_AUTH_MESSAGE, normaliseAuthError } from '@/auth/auth-errors';

export const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInLoading, setSignInLoading] = useState(false);
  const [signUpLoading, setSignUpLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ signin?: string; signup?: string }>({});
  const { toast } = useToast();
  const { error: authErrorFromContext } = useAuth();

  const normaliseErrorMessage = useCallback((error: unknown) => normaliseAuthError(error), []);

  const handleAuthError = useCallback(
    (scope: 'signin' | 'signup', error: unknown) => {
      const message = normaliseErrorMessage(error);
      setFormErrors((prev) => ({ ...prev, [scope]: message }));
      toast({
        title: 'Authentication error',
        description: message,
        variant: 'destructive',
      });
    },
    [normaliseErrorMessage, toast]
  );

  const resetFormError = useCallback((scope: 'signin' | 'signup') => {
    setFormErrors((prev) => ({ ...prev, [scope]: undefined }));
  }, []);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormError('signup');
    setSignUpLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        handleAuthError('signup', error);
        return;
      }

      toast({
        title: 'Success',
        description: 'Account created! You can now sign in.',
      });
      setPassword('');
    } catch (error) {
      handleAuthError('signup', error);
    } finally {
      setSignUpLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormError('signin');
    setSignInLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        handleAuthError('signin', error);
        return;
      }
      toast({ title: 'Signed in', description: 'Welcome back!' });
      setPassword('');
    } catch (error) {
      handleAuthError('signin', error);
    } finally {
      setSignInLoading(false);
    }
  };

  const disableAuthInputs = useMemo(
    () => signInLoading || signUpLoading || githubLoading || Boolean(authErrorFromContext?.misconfigured),
    [signInLoading, signUpLoading, githubLoading, authErrorFromContext]
  );

  const handleGithubLogin = useCallback(async () => {
    resetFormError('signin');
    resetFormError('signup');
    setGithubLoading(true);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          scopes: 'repo workflow read:user user:email',
          redirectTo: `${window.location.origin}/agent`,
        },
      });

      if (error) {
        // Check for GitHub OAuth not enabled error
        if (error.message?.includes('provider is not enabled') ||
            error.message?.includes('Unsupported provider')) {
          toast({
            title: 'GitHub OAuth Not Enabled',
            description: 'GitHub OAuth is not configured in Supabase. Please enable it in your Supabase dashboard (Authentication → Providers → GitHub) or use email/password sign-in and enter a GitHub token manually.',
            variant: 'destructive',
            duration: 10000,
          });
        } else {
          handleAuthError('signin', error);
        }
      }
    } catch (error) {
      handleAuthError('signin', error);
    } finally {
      setGithubLoading(false);
    }
  }, [handleAuthError, resetFormError, toast]);

  const authErrorMessage = useMemo(() => {
    if (!authErrorFromContext) {
      return null;
    }

    if (authErrorFromContext.misconfigured) {
      return MISCONFIGURED_AUTH_MESSAGE;
    }

    return authErrorFromContext.message;
  }, [authErrorFromContext]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="glass glow w-full max-w-md p-8">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="relative">
            <Brain className="w-12 h-12 text-primary" />
            <Sparkles className="w-5 h-5 text-secondary absolute -top-1 -right-1 animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Autonomous AI
            </h1>
            <p className="text-sm text-muted-foreground">Self-Learning Development System</p>
          </div>
        </div>

        {authErrorMessage && (
          <Alert variant="destructive" className="mb-6">
            <AlertTitle>Authentication unavailable</AlertTitle>
            <AlertDescription>{authErrorMessage}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3 mb-6">
          <Button
            type="button"
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
            onClick={handleGithubLogin}
            disabled={disableAuthInputs}
          >
            {githubLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Github className="h-4 w-4" />
            )}
            {githubLoading ? 'Connecting to GitHub…' : 'Continue with GitHub'}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            One-click GitHub login securely shares your OAuth token with the builder.
          </p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 glass">
            <TabsTrigger value="signin">Sign In</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-input/50 border-border/50"
                  disabled={disableAuthInputs}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-input/50 border-border/50"
                  disabled={disableAuthInputs}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 glow-strong"
                disabled={disableAuthInputs}
              >
                {signInLoading ? 'Signing in...' : 'Sign In'}
              </Button>
              {formErrors.signin && (
                <p className="text-sm text-destructive" role="alert">
                  {formErrors.signin}
                </p>
              )}
            </form>
          </TabsContent>

          <TabsContent value="signup">
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="bg-input/50 border-border/50"
                  disabled={disableAuthInputs}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="bg-input/50 border-border/50"
                  disabled={disableAuthInputs}
                />
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 glow-strong"
                disabled={disableAuthInputs}
              >
                {signUpLoading ? 'Creating account...' : 'Sign Up'}
              </Button>
              {formErrors.signup && (
                <p className="text-sm text-destructive" role="alert">
                  {formErrors.signup}
                </p>
              )}
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};
