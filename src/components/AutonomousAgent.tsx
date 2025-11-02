import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Brain, Activity, Play, Pause, Cpu, Network, Shield, 
  Terminal, Code, TrendingUp, Zap, CheckCircle, XCircle,
  Clock, AlertTriangle, FileCode, GitBranch, BarChart3,
  Sparkles, Target, Lightbulb, Database, CloudCog
} from 'lucide-react';
import { StatsGrid } from './StatsGrid';
import { ActivityFeed } from './ActivityFeed';
import { TerminalPanel } from './TerminalPanel';
import { MetricsChart } from './MetricsChart';

// Type definitions
interface ActivityItem {
  id: string;
  type: 'ai' | 'success' | 'error' | 'info';
  message: string;
  timestamp: Date;
  status: 'progress' | 'success' | 'error' | 'pending';
}

interface Stats {
  tasksCompleted: number;
  linesChanged: number;
  aiDecisions: number;
  learningScore: number;
  knowledgeNodes: number;
  autonomyLevel: number;
}

interface Performance {
  cpu: number;
  memory: number;
  throughput: number;
  latency: number;
}

// Constants
const PERFORMANCE_UPDATE_INTERVAL = 2000;
const TASK_SIMULATION_DELAY = 3000;
const MAX_PERFORMANCE_VALUE = 100;
const MAX_LEARNING_SCORE = 100;
const INITIAL_KNOWLEDGE_NODES = 1247;

const RECENT_LEARNINGS = [
  'React component optimization patterns',
  'Advanced TypeScript type inference',
  'Database query optimization',
  'Machine learning model fine-tuning',
  'Distributed system architecture'
];

export const AutonomousAgent: React.FC = () => {
  // State management
  const [isRunning, setIsRunning] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const [stats, setStats] = useState<Stats>({
    tasksCompleted: 0,
    linesChanged: 0,
    aiDecisions: 0,
    learningScore: 75,
    knowledgeNodes: INITIAL_KNOWLEDGE_NODES,
    autonomyLevel: 92
  });

  const [performance, setPerformance] = useState<Performance>({
    cpu: 0,
    memory: 0,
    throughput: 0,
    latency: 0
  });

  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  
  // Refs
  const performanceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const taskTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const activityIdRef = useRef(0);

  // Utility functions
  const generateActivityId = useCallback(() => `activity-${++activityIdRef.current}`, []);

  const clampValue = useCallback((value: number, min: number = 0, max: number = MAX_PERFORMANCE_VALUE): number => {
    return Math.min(max, Math.max(min, value));
  }, []);

  const addActivity = useCallback((
    type: ActivityItem['type'], 
    message: string, 
    status: ActivityItem['status'] = 'pending'
  ) => {
    const newActivity: ActivityItem = {
      id: generateActivityId(),
      type,
      message,
      timestamp: new Date(),
      status
    };
    
    setActivities(prev => [newActivity, ...prev.slice(0, 99)]); // Keep only last 100 activities
  }, [generateActivityId]);

  const addTerminalOutput = useCallback((output: string | string[]) => {
    const outputs = Array.isArray(output) ? output : [output];
    setTerminalOutput(prev => [...prev, ...outputs].slice(-1000)); // Keep only last 1000 lines
  }, []);

  // Performance metrics simulation
  const updatePerformanceMetrics = useCallback(() => {
    setPerformance(prev => ({
      cpu: clampValue(prev.cpu + (Math.random() - 0.5) * 20),
      memory: clampValue(prev.memory + (Math.random() - 0.5) * 15),
      throughput: Math.floor(Math.random() * 1000),
      latency: Math.floor(Math.random() * 100)
    }));
  }, [clampValue]);

  // Task execution handler
  const handleExecuteTask = useCallback(async () => {
    if (!instruction.trim() || isRunning) return;
    
    try {
      setIsRunning(true);
      setIsLoading(true);
      setError(null);
      
      const task = instruction.trim();
      setInstruction('');

      // Add initial activity
      addActivity('ai', `Processing: ${task}`, 'progress');

      // Add terminal output
      addTerminalOutput([
        `> ${task}`,
        'Analyzing request...',
        'Planning execution strategy...',
        'Initializing AI subsystems...'
      ]);

      // Simulate AI processing with proper error handling
      taskTimeoutRef.current = setTimeout(() => {
        try {
          // Update activities
          addActivity('success', `Task completed: ${task}`, 'success');
          
          // Update stats
          setStats(prev => ({
            ...prev,
            tasksCompleted: prev.tasksCompleted + 1,
            aiDecisions: prev.aiDecisions + Math.floor(Math.random() * 5) + 1,
            learningScore: clampValue(prev.learningScore + 1, 0, MAX_LEARNING_SCORE),
            linesChanged: prev.linesChanged + Math.floor(Math.random() * 50) + 10
          }));

          addTerminalOutput([
            '✓ Task analysis complete',
            '✓ Implementation successful',
            '✓ Tests passed',
            '✓ Task completed successfully',
            ''
          ]);
          
        } catch (taskError) {
          const errorMessage = taskError instanceof Error ? taskError.message : 'Task execution failed';
          setError(errorMessage);
          addActivity('error', `Task failed: ${errorMessage}`, 'error');
          addTerminalOutput(['✗ Task execution failed', `Error: ${errorMessage}`, '']);
        } finally {
          setIsRunning(false);
          setIsLoading(false);
        }
      }, TASK_SIMULATION_DELAY);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to execute task';
      setError(errorMessage);
      addActivity('error', errorMessage, 'error');
      setIsRunning(false);
      setIsLoading(false);
    }
  }, [instruction, isRunning, addActivity, addTerminalOutput, clampValue]);

  const handleStopTask = useCallback(() => {
    if (taskTimeoutRef.current) {
      clearTimeout(taskTimeoutRef.current);
      taskTimeoutRef.current = null;
    }
    
    setIsRunning(false);
    setIsLoading(false);
    addActivity('info', 'Task execution stopped by user', 'error');
    addTerminalOutput(['⚠ Task execution interrupted', '']);
  }, [addActivity, addTerminalOutput]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isRunning && instruction.trim()) {
      handleExecuteTask();
    }
  }, [handleExecuteTask, isRunning, instruction]);

  // Effects
  useEffect(() => {
    // Start performance metrics updates
    performanceIntervalRef.current = setInterval(updatePerformanceMetrics, PERFORMANCE_UPDATE_INTERVAL);

    return () => {
      // Cleanup intervals and timeouts
      if (performanceIntervalRef.current) {
        clearInterval(performanceIntervalRef.current);
      }
      if (taskTimeoutRef.current) {
        clearTimeout(taskTimeoutRef.current);
      }
    };
  }, [updatePerformanceMetrics]);

  // Add initial welcome message
  useEffect(() => {
    addActivity('info', 'AI Agent initialized and ready for instructions', 'success');
    addTerminalOutput([
      'Autonomous AI Agent v2.0.0',
      'System initialized successfully',
      'Ready for instructions...',
      ''
    ]);
  }, [addActivity, addTerminalOutput]);

  // Memoized values
  const statusBadges = useMemo(() => [
    {
      icon: Cpu,
      label: `CPU: ${performance.cpu.toFixed(0)}%`,
      variant: 'outline' as const,
      color: 'text-primary'
    },
    {
      icon: Network,
      label: `${stats.knowledgeNodes} Nodes`,
      variant: 'outline' as const,
      color: 'text-accent'
    },
    {
      icon: Zap,
      label: `IQ: ${stats.learningScore}%`,
      variant: 'outline' as const,
      color: 'text-warning'
    },
    {
      icon: Shield,
      label: 'Secure',
      variant: 'outline' as const,
      color: 'text-success'
    }
  ], [performance.cpu, stats.knowledgeNodes, stats.learningScore]);

  const knowledgeCards = useMemo(() => [
    {
      title: 'Total Nodes',
      value: stats.knowledgeNodes,
      icon: Network,
      color: 'text-accent'
    },
    {
      title: 'Learning Progress',
      value: `${stats.learningScore}%`,
      icon: TrendingUp,
      color: 'text-success'
    },
    {
      title: 'Autonomy Level',
      value: `${stats.autonomyLevel}%`,
      icon: Target,
      color: 'text-primary'
    }
  ], [stats]);

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="glass border-b border-border/50 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Brain className="w-10 h-10 text-primary" />
                <Sparkles className="w-4 h-4 text-secondary absolute -top-1 -right-1 animate-pulse-glow" />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Autonomous AI Agent
                </h1>
                <p className="text-sm text-muted-foreground">Self-Learning Development System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3" role="status" aria-label="System status">
              {statusBadges.map(({ icon: Icon, label, variant, color }, index) => (
                <Badge key={index} variant={variant} className={`gap-2 glass ${color}`}>
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-6">
        {/* Error Display */}
        {error && (
          <Card className="glass border-destructive/50 bg-destructive/10 mb-6 p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              <div>
                <p className="font-semibold text-destructive">Error</p>
                <p className="text-sm text-destructive/80">{error}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="ml-auto"
                aria-label="Dismiss error"
              >
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        )}

        {/* Command Input */}
        <Card className="glass glow mb-6 p-6">
          <div className="flex gap-4">
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter your instruction for the AI agent..."
              className="flex-1 bg-input/50 border-border/50 focus:border-primary text-lg"
              disabled={isRunning}
              aria-label="AI instruction input"
              autoComplete="off"
            />
            <Button 
              onClick={isRunning ? handleStopTask : handleExecuteTask}
              disabled={!instruction.trim() && !isRunning}
              className={`${isRunning ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'} glow-strong gap-2 px-8`}
              aria-label={isRunning ? 'Stop task execution' : 'Execute task'}
            >
              {isRunning ? (
                <>
                  <Pause className="w-5 h-5" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Execute
                </>
              )}
            </Button>
          </div>
          
          {(isRunning || isLoading) && (
            <div className="mt-4 flex items-center gap-3 text-primary animate-slide-up">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse-glow" />
              <span className="text-sm">AI agent is processing your request...</span>
            </div>
          )}
        </Card>

        {/* Stats Grid */}
        <StatsGrid stats={stats} performance={performance} />

        {/* Tabs for Different Views */}
        <Tabs defaultValue="activity" className="mt-6">
          <TabsList className="glass" role="tablist">
            <TabsTrigger value="activity" className="gap-2" role="tab">
              <Activity className="w-4 h-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2" role="tab">
              <BarChart3 className="w-4 h-4" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="terminal" className="gap-2" role="tab">
              <Terminal className="w-4 h-4" />
              Terminal
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-2" role="tab">
              <Brain className="w-4 h-4" />
              Knowledge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-4" role="tabpanel">
            <ActivityFeed activities={activities} />
          </TabsContent>

          <TabsContent value="metrics" className="mt-4" role="tabpanel">
            <MetricsChart performance={performance} stats={stats} />
          </TabsContent>

          <TabsContent value="terminal" className="mt-4" role="tabpanel">
            <TerminalPanel output={terminalOutput} />
          </TabsContent>

          <TabsContent value="knowledge" className="mt-4" role="tabpanel">
            <Card className="glass p-6">
              <div className="flex items-center gap-3 mb-6">
                <Brain className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold">Knowledge Graph</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {knowledgeCards.map(({ title, value, icon: Icon, color }, index) => (
                  <Card key={index} className="bg-muted/30 p-4 border-border/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-muted-foreground">{title}</span>
                      <Icon className={`w-4 h-4 ${color}`} />
                    </div>
                    <p className={`text-2xl font-bold ${color}`}>{value}</p>
                  </Card>
                ))}
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-warning" />
                  Recent Learnings
                </h4>
                <div className="space-y-2">
                  {RECENT_LEARNINGS.slice(0, 3).map((learning, i) => (
                    <div 
                      key={learning} 
                      className="flex items-center gap-2 p-2 rounded bg-muted/20 text-sm animate-slide-up" 
                      style={{ animationDelay: `${i * 100}ms` }}
                    >
                      <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      <span>{learning}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default AutonomousAgent;