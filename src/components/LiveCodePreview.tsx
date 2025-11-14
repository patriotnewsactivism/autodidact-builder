import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Eye,
  RefreshCw,
  Terminal,
  AlertCircle,
  CheckCircle,
  Loader2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LiveCodePreviewProps {
  code?: string;
  language?: string;
  className?: string;
}

type ConsoleLogLevel = 'log' | 'warn' | 'error';

interface ConsoleLogEntry {
  type: ConsoleLogLevel;
  message: string;
  timestamp: Date;
}

const DEFAULT_LANGUAGE = 'html';

const buildPreviewHTML = (code: string, language: string): string => {
  const sanitizedLanguage = language.toLowerCase();
  const scriptContent =
    sanitizedLanguage === 'html'
      ? code
      : `<script type="module">\n${code}\n</script>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Live Preview</title>
    <style>
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont;
        background: #0f172a;
        color: #fff;
      }
    </style>
  </head>
  <body>
    ${scriptContent}
    <script>
      (function () {
        const sendMessage = (type, payload) => {
          window.parent.postMessage({ type, payload }, '*');
        };

        const wrapConsole = () => {
          ['log', 'warn', 'error'].forEach((level) => {
            const original = console[level];
            console[level] = (...args) => {
              try {
                sendMessage('preview-console', {
                  type: level,
                  message: args.map((arg) => {
                    if (typeof arg === 'object') {
                      try {
                        return JSON.stringify(arg);
                      } catch (error) {
                        return String(arg);
                      }
                    }
                    return String(arg);
                  }).join(' '),
                });
              } catch {
                /* no-op */
              }
              original.apply(console, args);
            };
          });
        };

        wrapConsole();

        window.onerror = (message, source, lineno, colno, error) => {
          sendMessage('preview-error', {
            message: message?.toString?.() ?? 'Unknown preview error',
            stack: error?.stack ?? null,
            source,
            lineno,
            colno,
          });
        };
      })();
    </script>
  </body>
</html>`;
};

export function LiveCodePreview({
  code,
  language = DEFAULT_LANGUAGE,
  className,
}: LiveCodePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLogEntry[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handlePreviewMessage = useCallback((event: MessageEvent) => {
    const { type, payload } = event.data ?? {};
    if (type === 'preview-console' && payload) {
      setConsoleLogs((prev) => [
        ...prev,
        {
          type: (payload.type as ConsoleLogLevel) ?? 'log',
          message: typeof payload.message === 'string' ? payload.message : String(payload.message),
          timestamp: new Date(),
        },
      ]);
      return;
    }

    if (type === 'preview-error' && payload) {
      setHasError(true);
      setErrorMessage(payload.message ?? 'Preview failed');
    }
  }, []);

  useEffect(() => {
    window.addEventListener('message', handlePreviewMessage);
    return () => {
      window.removeEventListener('message', handlePreviewMessage);
    };
  }, [handlePreviewMessage]);

  const updatePreview = useCallback(() => {
    if (!iframeRef.current || !code) {
      return;
    }

    try {
      setIsLoading(true);
      setHasError(false);
      setErrorMessage(null);
      setConsoleLogs([]);

      const previewHTML = buildPreviewHTML(code, language);
      iframeRef.current.srcdoc = previewHTML;
    } catch (error) {
      setHasError(true);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to render preview');
    } finally {
      setIsLoading(false);
    }
  }, [code, language]);

  useEffect(() => {
    if (code) {
      updatePreview();
    } else {
      setHasError(false);
      setErrorMessage(null);
      setConsoleLogs([]);
    }
  }, [code, updatePreview]);

  const renderPlaceholder = () => (
    <div className="flex h-full flex-col items-center justify-center text-slate-400">
      <Eye className="mb-4 h-12 w-12 opacity-40" />
      <p className="text-sm">Preview appears here when the agent generates code.</p>
    </div>
  );

  return (
    <div className={cn('flex h-full flex-col rounded-lg border bg-slate-950', className)}>
      <div className="flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <Eye className="h-4 w-4 text-slate-400" />
          Live Preview
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          {hasError && !isLoading && <AlertCircle className="h-3 w-3 text-red-500" />}
          {!hasError && !isLoading && code && <CheckCircle className="h-3 w-3 text-emerald-500" />}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={updatePreview}
            disabled={!code}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen((prev) => !prev)}
            disabled={!code}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {!code ? (
        renderPlaceholder()
      ) : (
        <div className="flex flex-1">
          {isFullscreen ? (
            <iframe
              ref={iframeRef}
              title="Live code preview"
              sandbox="allow-scripts allow-same-origin allow-modals"
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <Tabs defaultValue="preview" className="flex w-full flex-col">
              <TabsList className="h-10 justify-start rounded-none border-b bg-transparent px-4">
                <TabsTrigger value="preview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                  <Eye className="mr-2 h-4 w-4" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="console" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                  <Terminal className="mr-2 h-4 w-4" />
                  Console
                  {consoleLogs.length > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      {consoleLogs.length}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="preview" className="m-0 flex-1 p-0">
                <iframe
                  ref={iframeRef}
                  title="Live code preview"
                  sandbox="allow-scripts allow-same-origin allow-modals"
                  className="h-full w-full border-0 bg-white"
                />
              </TabsContent>

              <TabsContent value="console" className="m-0 flex-1 bg-slate-900 p-0">
                <ScrollArea className="h-full">
                  <div className="space-y-1 p-4 font-mono text-xs text-slate-200">
                    {consoleLogs.length === 0 ? (
                      <div className="py-8 text-center text-slate-500">
                        Console output will appear here.
                      </div>
                    ) : (
                      consoleLogs.map((log, index) => (
                        <div
                          key={`${log.timestamp.getTime()}-${index}`}
                          className={cn(
                            'rounded px-2 py-1',
                            log.type === 'error' && 'bg-red-500/10 text-red-300',
                            log.type === 'warn' && 'bg-yellow-500/10 text-yellow-300',
                            log.type === 'log' && 'text-slate-200',
                          )}
                        >
                          <span className="mr-2 text-slate-500">
                            {log.timestamp.toLocaleTimeString()}
                          </span>
                          {log.message}
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>
      )}

      {hasError && errorMessage && (
        <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200">
          {errorMessage}
        </div>
      )}
    </div>
  );
}
