import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  CheckCircle, XCircle, Clock, AlertTriangle, 
  Brain, Shield, Sparkles, Activity
} from 'lucide-react';

interface Activity {
  type: string;
  message: string;
  timestamp: Date;
  status: string;
}

interface ActivityFeedProps {
  activities: Activity[];
}

export const ActivityFeed = ({ activities }: ActivityFeedProps) => {
  const getActivityIcon = (type: string, status: string) => {
    if (status === 'success') return <CheckCircle className="w-4 h-4 text-success" />;
    if (status === 'error') return <XCircle className="w-4 h-4 text-destructive" />;
    if (status === 'warning') return <AlertTriangle className="w-4 h-4 text-warning" />;
    if (status === 'progress') return <Clock className="w-4 h-4 text-primary animate-pulse" />;
    
    switch (type) {
      case 'ai': return <Brain className="w-4 h-4 text-secondary" />;
      case 'security': return <Shield className="w-4 h-4 text-success" />;
      default: return <Activity className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'border-success/50 bg-success/5';
      case 'error': return 'border-destructive/50 bg-destructive/5';
      case 'warning': return 'border-warning/50 bg-warning/5';
      case 'progress': return 'border-primary/50 bg-primary/5';
      default: return 'border-border/50 bg-muted/5';
    }
  };

  return (
    <Card className="glass p-6">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="w-6 h-6 text-primary" />
        <h3 className="text-xl font-semibold">Live Activity Feed</h3>
        <Badge variant="outline" className="ml-auto">{activities.length} events</Badge>
      </div>

      <ScrollArea className="h-[500px]">
        {activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Activity className="w-12 h-12 mb-3 opacity-50" />
            <p>No activities yet. Start by giving the agent a task.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${getStatusColor(activity.status)} animate-slide-up`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {getActivityIcon(activity.type, activity.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{activity.message}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {activity.timestamp.toLocaleTimeString()}
                    </p>
                  </div>
                  {activity.status === 'progress' && (
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                      <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};
