import React, { Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Navigation } from "@/components/navigation";
import { useAuth } from "@/auth/AuthProvider";

const Index = React.lazy(() => import("./pages/Index"));
const AutonomousAgentPage = React.lazy(() => import("./pages/AutonomousAgent"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

const AppLoading: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center space-y-4">
      <LoadingSpinner size="lg" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Loading GitHub tools</h2>
        <p className="text-muted-foreground">Preparing the workspace...</p>
      </div>
    </div>
  </div>
);

const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({
  error,
  resetErrorBoundary,
}) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="max-w-md w-full space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-destructive">Something went wrong</h1>
        <p className="text-muted-foreground">The application encountered an unexpected error.</p>
      </div>

      <div className="bg-muted/30 p-4 rounded-lg text-left">
        <code className="text-sm text-destructive">{error.message}</code>
      </div>

      <div className="flex gap-3 justify-center">
        <button
          onClick={resetErrorBoundary}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          Try Again
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-colors"
        >
          Reload Page
        </button>
      </div>
    </div>
  </div>
);

const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="transition-all duration-300">{children}</main>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAuth?: boolean }> = ({
  children,
  requireAuth = false,
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (!requireAuth) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="space-y-3 text-center">
          <LoadingSpinner size="lg" />
          <p className="text-sm text-muted-foreground">Validating your session…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error("App Error:", error, errorInfo);
      }}
      onReset={() => {
        window.location.reload();
      }}
    >
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark" storageKey="ai-agent-theme">
          <TooltipProvider delayDuration={300}>
            <BrowserRouter>
              <Suspense fallback={<AppLoading />}>
                <AppLayout>
                  <Routes>
                    <Route path="/" element={<Index />} />
                    <Route
                      path="/agent"
                      element={
                        <ProtectedRoute requireAuth>
                          <AutonomousAgentPage />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </Suspense>
            </BrowserRouter>

            <Toaster />
            <Sonner
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "hsl(var(--background))",
                  border: "1px solid hsl(var(--border))",
                  color: "hsl(var(--foreground))",
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
