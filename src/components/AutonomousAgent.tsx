import { useState, useEffect, useRef } from 'react';
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

export const AutonomousAgent = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [activities, setActivities] = useState<any[]>([]);
  const [stats, setStats] = useState({
    tasksCompleted: 0,
    linesChanged: 0,
    aiDecisions: 0,
    learningScore: 75,
    knowledgeNodes: 1247,
    autonomyLevel: 92
  });
  const [performance, setPerformance] = useState({
    cpu: 0,
    memory: 0,
    throughput: 0,
    latency: 0
  });
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);

  // Simulate real-time metrics
  useEffect(() => {
    const interval = setInterval(() => {
      setPerformance(prev => ({
        cpu: Math.min(100, Math.max(0, prev.cpu + (Math.random() - 0.5) * 20)),
        memory: Math.min(100, Math.max(0, prev.memory + (Math.random() - 0.5) * 15)),
        throughput: Math.floor(Math.random() * 1000),
        latency: Math.floor(Math.random() * 100)
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  const handleExecuteTask = async () => {
    if (!instruction.trim()) return;
    
    setIsRunning(true);
    const task = instruction;
    setInstruction('');

    // Add activity
    setActivities(prev => [{
      type: 'ai',
      message: `Processing: ${task}`,
      timestamp: new Date(),
      status: 'progress'
    }, ...prev]);

    // Simulate terminal output
    setTerminalOutput(prev => [...prev, `> ${task}`, 'Analyzing request...', 'Planning execution strategy...']);

    // Simulate AI processing
    setTimeout(() => {
      setActivities(prev => [{
        type: 'success',
        message: `Task completed: ${task}`,
        timestamp: new Date(),
        status: 'success'
      }, ...prev]);
      
      setStats(prev => ({
        ...prev,
        tasksCompleted: prev.tasksCompleted + 1,
        aiDecisions: prev.aiDecisions + Math.floor(Math.random() * 5) + 1,
        learningScore: Math.min(100, prev.learningScore + 1)
      }));

      setTerminalOutput(prev => [...prev, '✓ Task completed successfully', '']);
      setIsRunning(false);
    }, 3000);
  };

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
            
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-2 glass">
                <Cpu className="w-4 h-4 text-primary" />
                <span>CPU: {performance.cpu.toFixed(0)}%</span>
              </Badge>
              <Badge variant="outline" className="gap-2 glass">
                <Network className="w-4 h-4 text-accent" />
                <span>{stats.knowledgeNodes} Nodes</span>
              </Badge>
              <Badge variant="outline" className="gap-2 glass">
                <Zap className="w-4 h-4 text-warning" />
                <span>IQ: {stats.learningScore}%</span>
              </Badge>
              <Badge variant="outline" className="gap-2 glass">
                <Shield className="w-4 h-4 text-success" />
                <span>Secure</span>
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-6 py-6">
        {/* Command Input */}
        <Card className="glass glow mb-6 p-6">
          <div className="flex gap-4">
            <Input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !isRunning && handleExecuteTask()}
              placeholder="Enter your instruction for the AI agent..."
              className="flex-1 bg-input/50 border-border/50 focus:border-primary text-lg"
              disabled={isRunning}
            />
            <Button 
              onClick={isRunning ? () => setIsRunning(false) : handleExecuteTask}
              disabled={!instruction.trim() && !isRunning}
              className={`${isRunning ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'} glow-strong gap-2 px-8`}
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
          
          {isRunning && (
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
          <TabsList className="glass">
            <TabsTrigger value="activity" className="gap-2">
              <Activity className="w-4 h-4" />
              Activity
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-2">
              <BarChart3 className="w-4 h-4" />
              Metrics
            </TabsTrigger>
            <TabsTrigger value="terminal" className="gap-2">
              <Terminal className="w-4 h-4" />
              Terminal
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="gap-2">
              <Brain className="w-4 h-4" />
              Knowledge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="activity" className="mt-4">
            <ActivityFeed activities={activities} />
          </TabsContent>

          <TabsContent value="metrics" className="mt-4">
            <MetricsChart performance={performance} stats={stats} />
          </TabsContent>

          <TabsContent value="terminal" className="mt-4">
            <TerminalPanel output={terminalOutput} />
          </TabsContent>

          <TabsContent value="knowledge" className="mt-4">
            <Card className="glass p-6">
              <div className="flex items-center gap-3 mb-6">
                <Brain className="w-6 h-6 text-primary" />
                <h3 className="text-xl font-semibold">Knowledge Graph</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-muted/30 p-4 border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Total Nodes</span>
                    <Network className="w-4 h-4 text-accent" />
                  </div>
                  <p className="text-2xl font-bold text-accent">{stats.knowledgeNodes}</p>
                </Card>
                
                <Card className="bg-muted/30 p-4 border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Learning Progress</span>
                    <TrendingUp className="w-4 h-4 text-success" />
                  </div>
                  <p className="text-2xl font-bold text-success">{stats.learningScore}%</p>
                </Card>
                
                <Card className="bg-muted/30 p-4 border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Autonomy Level</span>
                    <Target className="w-4 h-4 text-primary" />
                  </div>
                  <p className="text-2xl font-bold text-primary">{stats.autonomyLevel}%</p>
                </Card>
              </div>

              <div className="mt-6">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-warning" />
                  Recent Learnings
                </h4>
                <div className="space-y-2">
                  {['React component optimization patterns', 'Advanced TypeScript type inference', 'Database query optimization'].map((learning, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/20 text-sm animate-slide-up" style={{ animationDelay: `${i * 100}ms` }}>
                      <CheckCircle className="w-4 h-4 text-success" />
                      <span>{learning}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
