import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from 'lucide-react';

interface TerminalPanelProps {
  output: string[];
}

export const TerminalPanel = ({ output }: TerminalPanelProps) => {
  return (
    <Card className="glass p-6 bg-black/40 border-primary/20">
      <div className="flex items-center gap-3 mb-4">
        <Terminal className="w-6 h-6 text-primary" />
        <h3 className="text-xl font-semibold">Terminal Output</h3>
        <div className="ml-auto flex gap-2">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <div className="w-3 h-3 rounded-full bg-warning" />
          <div className="w-3 h-3 rounded-full bg-success" />
        </div>
      </div>

      <ScrollArea className="h-[500px]">
        <div className="font-mono text-sm space-y-1">
          {output.length === 0 ? (
            <div className="text-muted-foreground opacity-50">
              <span className="text-primary">$</span> Waiting for commands...
            </div>
          ) : (
            output.map((line, index) => (
              <div 
                key={index} 
                className={`${line.startsWith('>') ? 'text-primary' : line.startsWith('✓') ? 'text-success' : 'text-foreground/80'} animate-slide-up`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {line.startsWith('>') ? (
                  <span><span className="text-primary">$</span> {line.slice(1)}</span>
                ) : (
                  line
                )}
              </div>
            ))
          )}
          <div className="text-primary animate-pulse">$<span className="inline-block w-2 h-4 bg-primary ml-1" /></div>
        </div>
      </ScrollArea>
    </Card>
  );
};
