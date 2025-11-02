import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, Activity, Play, Cpu, Network, Shield, 
  Terminal, BarChart3, Zap, Target, Lightbulb,
  CheckCircle, TrendingUp, LogOut
} from 'lucide-react';
import { StatsGrid } from './StatsGrid';
import { ActivityFeed } from './ActivityFeed';
import { TerminalPanel } from './TerminalPanel';
import { MetricsChart } from './MetricsChart';
import { useAgentData } from '@/hooks/useAgentData';
import { useAuth } from '@/hooks/useAuth';

export const AutonomousAgent = () => {
  const { user, signOut } = useAuth();
  const { activities, stats, executeTask } = useAgentData(user?.id);
  const [instruction, setInstruction] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [performance] = useState({
    cpu: 45,
    memory: 62,
    throughput: 850,
    latency: 23
  });
  const [terminalOutput] = useState<string[]>([
    'Autonomous AI Agent initialized...',
    'Real-time learning enabled',
    'Connected to AI processing engine',
    'System ready for autonomous operation',
  ]);

  const handleExecuteTask = async () => {
    if (!instruction.trim()) return;
    
    setIsProcessing(true);
    await executeTask(instruction);
    setInstruction('');
    setIsProcessing(false);
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
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                  Autonomous AI Agent
                </h1>
                <p className="text-sm text-muted-foreground">Real AI-Powered Development System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="gap-2 glass">
                <Cpu className="w-4 h-4 text-primary" />
                <span>CPU: {performance.cpu}%</span>
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
                <span>Active</span>
              </Badge>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={signOut}
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </Button>
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
              onKeyPress={(e) => e.key === 'Enter' && !isProcessing && handleExecuteTask()}
              placeholder="Enter your instruction for the AI agent..."
              className="flex-1 bg-input/50 border-border/50 focus:border-primary text-lg"
              disabled={isProcessing}
            />
            <Button 
              onClick={handleExecuteTask}
              disabled={!instruction.trim() || isProcessing}
              className="bg-primary hover:bg-primary/90 glow-strong gap-2 px-8"
            >
              <Play className="w-5 h-5" />
              {isProcessing ? 'Processing...' : 'Execute'}
            </Button>
          </div>
          
          {isProcessing && (
            <div className="mt-4 flex items-center gap-3 text-primary animate-slide-up">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse-glow" />
              <span className="text-sm">AI agent is processing your request with real AI...</span>
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
                  Real AI Learning - Stored in Database
                </h4>
                <div className="text-sm text-muted-foreground">
                  Every task you execute is analyzed by real AI (Gemini Flash) and stored in your knowledge graph for continuous learning.
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};