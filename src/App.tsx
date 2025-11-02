import React, { Suspense, ErrorBoundary } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { ErrorBoundary as CustomErrorBoundary } from "@/components/error-boundary";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Navigation } from "@/components/navigation";

// Pages - Lazy loaded for better performance
const Index = React.lazy(() => import("./pages/Index"));
const AutonomousAgent = React.lazy(() => import("./pages/AutonomousAgent"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const Analytics = React.lazy(() => import("./pages/Analytics"));
const Settings = React.lazy(() => import("./pages/Settings"));
const Documentation = React.lazy(() => import("./pages/Documentation"));
const NotFound = React.lazy(() => import("./pages/NotFound"));

// Enhanced Query Client with better defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      refetchOnMount: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Loading component for Suspense fallback
const AppLoading: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="text-center space-y-4">
      <LoadingSpinner size="lg" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Loading AI Agent</h2>
        <p className="text-muted-foreground">Initializing autonomous systems...</p>
      </div>
    </div>
  </div>
);

// Error Fallback component
const ErrorFallback: React.FC<{ error: Error; resetErrorBoundary: () => void }> = ({ 
  error, 
  resetErrorBoundary 
}) => (
  <div className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="max-w-md w-full space-y-6 text-center">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-destructive">Something went wrong</h1>
        <p className="text-muted-foreground">
          The AI Agent encountered an unexpected error
        </p>
      </div>
      
      <div className="bg-muted/30 p-4 rounded-lg text-left">
        <code className="text-sm text-destructive">
          {error.message}
        </code>
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

// Main App Layout wrapper
const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-background">
    <Navigation />
    <main className="transition-all duration-300">
      {children}
    </main>
  </div>
);

// Protected Route wrapper (for future authentication)
const ProtectedRoute: React.FC<{ children: React.ReactNode; requireAuth?: boolean }> = ({ 
  children, 
  requireAuth = false 
}) => {
  // For now, just return children - add authentication logic later
  if (requireAuth) {
    // const isAuthenticated = useAuth(); // Implement when needed
    // if (!isAuthenticated) return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error, errorInfo) => {
        console.error('App Error:', error, errorInfo);
        // Send to error reporting service
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
                    {/* Main Routes */}
                    <Route path="/" element={<Index />} />
                    
                    {/* AI Agent Routes */}
                    <Route 
                      path="/agent" 
                      element={
                        <ProtectedRoute>
                          <AutonomousAgent />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Dashboard Routes */}
                    <Route 
                      path="/dashboard" 
                      element={
                        <ProtectedRoute>
                          <Dashboard />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Analytics Routes */}
                    <Route 
                      path="/analytics" 
                      element={
                        <ProtectedRoute>
                          <Analytics />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Settings Routes */}
                    <Route 
                      path="/settings" 
                      element={
                        <ProtectedRoute>
                          <Settings />
                        </ProtectedRoute>
                      } 
                    />
                    
                    {/* Documentation */}
                    <Route path="/docs" element={<Documentation />} />
                    
                    {/* API Routes */}
                    <Route path="/api-status" element={<ApiStatus />} />
                    
                    {/* Redirect old routes */}
                    <Route path="/autonomous-agent" element={<Navigate to="/agent" replace />} />
                    <Route path="/ai-agent" element={<Navigate to="/agent" replace />} />
                    
                    {/* 404 - Keep this as the last route */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </AppLayout>
              </Suspense>
            </BrowserRouter>
            
            {/* Toast Notifications */}
            <Toaster />
            <Sonner 
              position="bottom-right"
              toastOptions={{
                style: {
                  background: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  color: 'hsl(var(--foreground))',
                },
              }}
            />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

// API Status component for monitoring
const ApiStatus: React.FC = () => {
  return (
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">API Status</h1>
          <p className="text-muted-foreground">Monitor the health of AI services</p>
        </div>
        
        <div className="grid gap-4">
          {[
            { name: 'AI Agent API', status: 'operational', latency: '45ms' },
            { name: 'Knowledge Graph', status: 'operational', latency: '12ms' },
            { name: 'Analytics Engine', status: 'operational', latency: '78ms' },
            { name: 'Terminal Service', status: 'operational', latency: '23ms' },
          ].map((service) => (
            <div key={service.name} className="glass p-4 rounded-lg flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="font-medium">{service.name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Latency: {service.latency}</span>
                <span className="capitalize text-green-600">{service.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default App;