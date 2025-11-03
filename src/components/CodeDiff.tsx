import { useMemo } from 'react';
import { diffLines } from 'diff';
import { ScrollArea } from '@/components/ui/scroll-area';

interface CodeDiffProps {
  original: string;
  updated: string;
  path?: string;
}

const normalise = (value: string) => (value ?? '').replace(/\r\n/g, '\n');

export const CodeDiff: React.FC<CodeDiffProps> = ({ original, updated }) => {
  const parts = useMemo(() => diffLines(normalise(original), normalise(updated)), [original, updated]);

  const hasChanges = parts.some((part) => part.added || part.removed);

  if (!hasChanges) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/40 p-4 text-xs text-muted-foreground">
        No differences detected. The agent returned content identical to the current file.
      </div>
    );
  }

  return (
    <ScrollArea className="max-h-[360px] rounded-md border border-border/60 bg-background">
      <pre className="space-y-0 p-4 text-xs leading-5">
        {parts.map((part, index) => {
          const lines = part.value.split('\n');
          if (lines[lines.length - 1] === '') {
            lines.pop();
          }
          return lines.map((line, lineIndex) => {
            const key = `${index}-${lineIndex}`;
            const isAdded = Boolean(part.added);
            const isRemoved = Boolean(part.removed);
            const prefix = isAdded ? '+' : isRemoved ? '-' : ' ';
            const lineClasses = isAdded
              ? 'bg-emerald-500/10 text-emerald-500'
              : isRemoved
              ? 'bg-destructive/10 text-destructive'
              : 'text-muted-foreground';
            return (
              <div key={key} className={`whitespace-pre-wrap break-words px-2 py-0.5 font-mono ${lineClasses}`}>
                <span className="mr-2 inline-block w-3 text-center font-semibold">{prefix}</span>
                {line || ' '}
              </div>
            );
          });
        })}
      </pre>
    </ScrollArea>
  );
};
