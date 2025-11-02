import { Card } from '@/components/ui/card';
import { BarChart3, Activity, Cpu, Database, Zap } from 'lucide-react';

interface MetricsChartProps {
  performance: {
    cpu: number;
    memory: number;
    throughput: number;
    latency: number;
  };
  stats: {
    learningScore: number;
    autonomyLevel: number;
  };
}

export const MetricsChart = ({ performance, stats }: MetricsChartProps) => {
  const metrics = [
    { label: 'CPU Usage', value: performance.cpu, icon: Cpu, color: 'primary', max: 100 },
    { label: 'Memory', value: performance.memory, icon: Database, color: 'accent', max: 100 },
    { label: 'Learning Score', value: stats.learningScore, icon: Activity, color: 'success', max: 100 },
    { label: 'Autonomy Level', value: stats.autonomyLevel, icon: Zap, color: 'warning', max: 100 },
  ];

  return (
    <Card className="glass p-6">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-6 h-6 text-primary" />
        <h3 className="text-xl font-semibold">Performance Metrics</h3>
      </div>

      <div className="space-y-6">
        {metrics.map((metric, index) => (
          <div key={index} className="animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <metric.icon className={`w-5 h-5 text-${metric.color}`} />
                <span className="text-sm font-medium">{metric.label}</span>
              </div>
              <span className={`text-lg font-bold text-${metric.color}`}>
                {metric.value.toFixed(1)}%
              </span>
            </div>
            
            <div className="relative h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className={`absolute top-0 left-0 h-full bg-${metric.color} transition-all duration-500 rounded-full`}
                style={{ width: `${(metric.value / metric.max) * 100}%` }}
              >
                <div className={`absolute inset-0 bg-${metric.color}-glow opacity-50 animate-pulse-glow`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        <Card className="bg-muted/30 p-4 border-border/50">
          <div className="text-sm text-muted-foreground mb-1">Throughput</div>
          <div className="text-2xl font-bold text-primary">{performance.throughput} ops/s</div>
        </Card>
        <Card className="bg-muted/30 p-4 border-border/50">
          <div className="text-sm text-muted-foreground mb-1">Latency</div>
          <div className="text-2xl font-bold text-accent">{performance.latency}ms</div>
        </Card>
      </div>
    </Card>
  );
};
