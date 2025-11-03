/**
 * Enhanced Real-Time Metrics Display
 *
 * Shows detailed, live-updating metrics about the agent's activity:
 * - Lines changed (added/removed breakdown)
 * - Files modified
 * - Tasks completed
 * - AI decisions made
 * - Learning progress
 * - Real-time activity stream with visual indicators
 */

import { Activity as ActivityIcon, Brain, Code2, FileCode, GitBranch, Zap, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface Activity {
  id: string;
  type: string;
  message: string;
  timestamp: Date;
  status: string;
}

interface Stats {
  tasksCompleted: number;
  linesChanged: number;
  aiDecisions: number;
  learningScore: number;
  knowledgeNodes: number;
  autonomyLevel: number;
}

interface EnhancedMetricsProps {
  activities: Activity[];
  stats: Stats;
  currentTaskStats?: {
    linesAdded?: number;
    linesRemoved?: number;
    filesModified?: number;
    model?: string;
  };
}

const getActivityIcon = (type: string, status: string) => {
  switch (type) {
    case 'ai':
      return <Brain className="h-4 w-4" />;
    case 'code':
      return <Code2 className="h-4 w-4" />;
    case 'file':
      return <FileCode className="h-4 w-4" />;
    case 'success':
      return <Zap className="h-4 w-4 text-green-500" />;
    case 'error':
      return <ActivityIcon className="h-4 w-4 text-red-500" />;
    case 'warning':
      return <ActivityIcon className="h-4 w-4 text-yellow-500" />;
    default:
      return <GitBranch className="h-4 w-4" />;
  }
};

const getActivityColor = (type: string, status: string): string => {
  if (status === 'error') return 'text-red-500';
  if (status === 'warning') return 'text-yellow-500';
  if (status === 'success') return 'text-green-500';

  switch (type) {
    case 'ai':
      return 'text-purple-500';
    case 'code':
      return 'text-blue-500';
    case 'file':
      return 'text-cyan-500';
    default:
      return 'text-gray-500';
  }
};

const formatTimestamp = (timestamp: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return timestamp.toLocaleDateString();
};

export function EnhancedMetrics({ activities, stats, currentTaskStats }: EnhancedMetricsProps) {
  return (
    <div className="space-y-4">
      {/* Real-time Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Tasks Completed */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Tasks</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.tasksCompleted}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              <span>Completed</span>
            </div>
          </CardContent>
        </Card>

        {/* Lines Changed */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Lines</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.linesChanged.toLocaleString()}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Code2 className="h-3 w-3" />
              <span>Changed</span>
            </div>
          </CardContent>
        </Card>

        {/* AI Decisions */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">AI Decisions</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.aiDecisions}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Brain className="h-3 w-3" />
              <span>Made</span>
            </div>
          </CardContent>
        </Card>

        {/* Autonomy Level */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Autonomy</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.autonomyLevel}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={stats.autonomyLevel} className="h-1" />
          </CardContent>
        </Card>

        {/* Learning Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Learning</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.learningScore}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={stats.learningScore} className="h-1" />
          </CardContent>
        </Card>

        {/* Knowledge Nodes */}
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">Knowledge</CardDescription>
            <CardTitle className="text-2xl font-bold">
              {stats.knowledgeNodes}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileCode className="h-3 w-3" />
              <span>Nodes</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Current Task Stats (if available) */}
      {currentTaskStats && (
        <Card className="border-purple-500/50 bg-purple-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-purple-500" />
              Current Task Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {currentTaskStats.linesAdded !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground">Lines Added</div>
                  <div className="text-lg font-bold text-green-500">
                    +{currentTaskStats.linesAdded.toLocaleString()}
                  </div>
                </div>
              )}
              {currentTaskStats.linesRemoved !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground">Lines Removed</div>
                  <div className="text-lg font-bold text-red-500">
                    -{currentTaskStats.linesRemoved.toLocaleString()}
                  </div>
                </div>
              )}
              {currentTaskStats.filesModified !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground">Files Modified</div>
                  <div className="text-lg font-bold text-blue-500">
                    {currentTaskStats.filesModified}
                  </div>
                </div>
              )}
              {currentTaskStats.model && (
                <div>
                  <div className="text-xs text-muted-foreground">AI Model</div>
                  <div className="text-sm font-medium">
                    <Badge variant="secondary">{currentTaskStats.model}</Badge>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Real-Time Activity Stream */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ActivityIcon className="h-4 w-4" />
            Real-Time Activity Stream
          </CardTitle>
          <CardDescription>Live updates from the autonomous agent</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-2">
              {activities.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ActivityIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">Activity will appear here in real-time</p>
                </div>
              ) : (
                activities.map((activity) => (
                  <div
                    key={activity.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border bg-card transition-colors',
                      'hover:bg-accent/50'
                    )}
                  >
                    <div className={cn('mt-0.5', getActivityColor(activity.type, activity.status))}>
                      {getActivityIcon(activity.type, activity.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-relaxed break-words">
                        {activity.message}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {activity.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(activity.timestamp)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
