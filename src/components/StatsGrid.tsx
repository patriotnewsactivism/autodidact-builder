import { Card } from '@/components/ui/card';
import { 
  CheckCircle, Code, Brain, TrendingUp, Zap, 
  FileCode, GitBranch, Target
} from 'lucide-react';

interface StatsGridProps {
  stats: {
    tasksCompleted: number;
    linesChanged: number;
    aiDecisions: number;
    learningScore: number;
    knowledgeNodes: number;
    autonomyLevel: number;
  };
  performance: {
    cpu: number;
    memory: number;
    throughput: number;
    latency: number;
  };
}

export const StatsGrid = ({ stats, performance }: StatsGridProps) => {
  const statCards = [
    {
      label: 'Tasks Completed',
      value: stats.tasksCompleted,
      icon: CheckCircle,
      color: 'text-success',
      bgColor: 'bg-success/10'
    },
    {
      label: 'Lines Changed',
      value: stats.linesChanged.toLocaleString(),
      icon: Code,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      label: 'AI Decisions',
      value: stats.aiDecisions,
      icon: Brain,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10'
    },
    {
      label: 'Throughput',
      value: `${performance.throughput}/s`,
      icon: Zap,
      color: 'text-warning',
      bgColor: 'bg-warning/10'
    },
    {
      label: 'Memory Usage',
      value: `${performance.memory.toFixed(0)}%`,
      icon: TrendingUp,
      color: 'text-accent',
      bgColor: 'bg-accent/10'
    },
    {
      label: 'Latency',
      value: `${performance.latency}ms`,
      icon: Target,
      color: 'text-foreground',
      bgColor: 'bg-muted'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {statCards.map((stat, index) => (
        <Card 
          key={index} 
          className="glass p-4 hover:shadow-glow transition-all duration-300 animate-slide-up"
          style={{ animationDelay: `${index * 50}ms` }}
        >
          <div className="flex items-start justify-between mb-2">
            <span className="text-xs text-muted-foreground font-medium">{stat.label}</span>
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
          </div>
          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
        </Card>
      ))}
    </div>
  );
};
