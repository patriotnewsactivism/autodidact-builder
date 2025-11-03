/**
 * RealTimeDiffViewer - Shows code changes in real-time with syntax highlighting
 */

import { useMemo } from 'react';
import { diffLines, Change } from 'diff';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileCode, Plus, Minus } from 'lucide-react';

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  language?: string;
}

interface RealTimeDiffViewerProps {
  diffs: FileDiff[];
  className?: string;
}

export function RealTimeDiffViewer({ diffs, className }: RealTimeDiffViewerProps) {
  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <FileCode className="h-12 w-12 text-slate-400 mb-4" />
        <h3 className="text-lg font-medium text-slate-300 mb-2">No changes yet</h3>
        <p className="text-sm text-slate-500">
          Code changes will appear here in real-time as the agent works
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-4 p-4">
        {diffs.map((diff, idx) => (
          <FileDiffView key={`${diff.path}-${idx}`} diff={diff} />
        ))}
      </div>
    </ScrollArea>
  );
}

function FileDiffView({ diff }: { diff: FileDiff }) {
  const changes = useMemo(() => {
    return diffLines(diff.oldContent || '', diff.newContent || '');
  }, [diff.oldContent, diff.newContent]);

  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    changes.forEach((change) => {
      if (change.added) added += change.count || 0;
      if (change.removed) removed += change.count || 0;
    });
    return { added, removed };
  }, [changes]);

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/30">
      {/* File Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-mono text-slate-300">{diff.path}</span>
          {diff.language && (
            <Badge variant="outline" className="text-xs">
              {diff.language}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-xs">
            <Plus className="h-3 w-3 text-green-400" />
            <span className="text-green-400 font-mono">{stats.added}</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <Minus className="h-3 w-3 text-red-400" />
            <span className="text-red-400 font-mono">{stats.removed}</span>
          </div>
        </div>
      </div>

      {/* Diff Content */}
      <div className="font-mono text-xs">
        {changes.map((change, idx) => (
          <DiffLine key={idx} change={change} lineNumber={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function DiffLine({ change, lineNumber }: { change: Change; lineNumber: number }) {
  const lines = change.value.split('\n').filter((line, idx, arr) => {
    // Remove last empty line if it exists
    return idx < arr.length - 1 || line !== '';
  });

  if (change.added) {
    return (
      <>
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="flex bg-green-500/10 hover:bg-green-500/20 transition-colors"
          >
            <span className="w-12 text-right px-2 py-1 text-green-400/50 select-none border-r border-green-500/20">
              {lineNumber + idx}
            </span>
            <span className="px-4 py-1 text-green-400 flex-1 min-w-0">
              <span className="text-green-400 mr-2">+</span>
              {line}
            </span>
          </div>
        ))}
      </>
    );
  }

  if (change.removed) {
    return (
      <>
        {lines.map((line, idx) => (
          <div
            key={idx}
            className="flex bg-red-500/10 hover:bg-red-500/20 transition-colors"
          >
            <span className="w-12 text-right px-2 py-1 text-red-400/50 select-none border-r border-red-500/20">
              {lineNumber + idx}
            </span>
            <span className="px-4 py-1 text-red-400 flex-1 min-w-0">
              <span className="text-red-400 mr-2">-</span>
              {line}
            </span>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      {lines.map((line, idx) => (
        <div
          key={idx}
          className="flex hover:bg-slate-700/30 transition-colors"
        >
          <span className="w-12 text-right px-2 py-1 text-slate-600 select-none border-r border-slate-700">
            {lineNumber + idx}
          </span>
          <span className="px-4 py-1 text-slate-400 flex-1 min-w-0">{line}</span>
        </div>
      ))}
    </>
  );
}
