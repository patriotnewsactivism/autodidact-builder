<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { useState, useEffect, useRef } from 'react';
import { Eye, RotateCcw, ExternalLink, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface LiveCodePreviewProps {
  code?: string;
  language?: string;
  className?: string;
}

export function LiveCodePreview({ code, language = 'html', className = '' }: LiveCodePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [error, setError] = useState<string>('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!code) return;

    try {
      // Create a sandboxed preview
      const htmlContent = generatePreviewHTML(code, language);
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      
      setPreviewUrl(url);
      setError('');

      return () => {
        URL.revokeObjectURL(url);
      };
    } catch (err: any) {
      setError(err.message || 'Failed to generate preview');
    }
  }, [code, language]);

  const handleRefresh = () => {
    if (iframeRef.current) {
      iframeRef.current.src = previewUrl;
    }
  };

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Live Preview
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={!previewUrl}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={handleOpenExternal} disabled={!previewUrl}>
            <ExternalLink className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-950 overflow-hidden">
        {error ? (
          <div className="flex items-center justify-center h-full p-8">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : previewUrl ? (
          <iframe
            ref={iframeRef}
            src={previewUrl}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
            title="Code Preview"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">Preview will appear here when code is generated</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function generatePreviewHTML(code: string, language: string): string {
  // Basic HTML template with error handling
  if (language === 'html' || language === 'tsx' || language === 'jsx') {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Preview</title>
=======
=======
>>>>>>> Stashed changes
/**
 * LiveCodePreview - Sandboxed code execution and preview
 *
 * Features:
 * - iframe sandbox for safe execution
 * - HTML/CSS/JS preview
 * - Auto-refresh on code changes
 * - Console output capture
 * - Error boundary
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Eye, Code2, Terminal, RefreshCw, Maximize2, Minimize2,
  AlertCircle, CheckCircle, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LiveCodePreviewProps {
  html?: string;
  css?: string;
  javascript?: string;
  className?: string;
  autoRefresh?: boolean;
}

interface ConsoleLog {
  type: 'log' | 'warn' | 'error';
  message: string;
  timestamp: Date;
}

export function LiveCodePreview({
  html = '',
  css = '',
  javascript = '',
  className,
  autoRefresh = true,
}: LiveCodePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Generate preview HTML
  const generatePreviewHTML = useCallback(() => {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
<<<<<<< Updated upstream
<<<<<<< Updated upstream
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
      color: #1a202c;
    }
  </style>
</head>
<body>
  ${code}
  <script>
    window.onerror = function(msg, url, line, col, error) {
      document.body.innerHTML = '<div style="padding: 20px; color: red; font-family: monospace;">' +
        '<h3>Preview Error</h3><p>' + msg + '</p></div>';
      return true;
    };
  </script>
</body>
</html>
    `;
  }

  // For other languages, show formatted code
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Code Preview</title>
  <style>
    body {
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      padding: 20px;
      background: #1e1e1e;
      color: #d4d4d4;
    }
    pre {
      white-space: pre-wrap;
      word-wrap: break-word;
    }
  </style>
</head>
<body>
  <pre><code>${escapeHtml(code)}</code></pre>
</body>
</html>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
=======
=======
>>>>>>> Stashed changes
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
    }
    ${css}
  </style>
</head>
<body>
  ${html}
  <script>
    // Capture console output and send to parent
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };

    console.log = function(...args) {
      window.parent.postMessage({
        type: 'console',
        level: 'log',
        message: args.map(arg => String(arg)).join(' ')
      }, '*');
      originalConsole.log.apply(console, args);
    };

    console.warn = function(...args) {
      window.parent.postMessage({
        type: 'console',
        level: 'warn',
        message: args.map(arg => String(arg)).join(' ')
      }, '*');
      originalConsole.warn.apply(console, args);
    };

    console.error = function(...args) {
      window.parent.postMessage({
        type: 'console',
        level: 'error',
        message: args.map(arg => String(arg)).join(' ')
      }, '*');
      originalConsole.error.apply(console, args);
    };

    // Catch runtime errors
    window.onerror = function(message, source, lineno, colno, error) {
      window.parent.postMessage({
        type: 'console',
        level: 'error',
        message: message + ' (Line: ' + lineno + ')'
      }, '*');
      return false;
    };

    // User code
    try {
      ${javascript}
    } catch (error) {
      console.error('JavaScript Error:', error.message);
    }
  </script>
</body>
</html>`;
  }, [html, css, javascript]);

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'console') {
        setConsoleLogs(prev => [
          ...prev,
          {
            type: event.data.level,
            message: event.data.message,
            timestamp: new Date(),
          },
        ]);

        if (event.data.level === 'error') {
          setHasError(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Update iframe when code changes
  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setTimeout(() => {
      updatePreview();
    }, 500); // Debounce

    return () => clearTimeout(timer);
  }, [html, css, javascript, autoRefresh]);

  const updatePreview = useCallback(() => {
    if (!iframeRef.current) return;

    setIsLoading(true);
    setHasError(false);
    setConsoleLogs([]);

    const previewHTML = generatePreviewHTML();
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;

    if (doc) {
      doc.open();
      doc.write(previewHTML);
      doc.close();
    }

    setIsLoading(false);
  }, [generatePreviewHTML]);

  const handleRefresh = () => {
    updatePreview();
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-slate-50 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Live Preview
          </span>
          {isLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
          {hasError && <AlertCircle className="h-3 w-3 text-red-500" />}
          {!isLoading && !hasError && (
            <CheckCircle className="h-3 w-3 text-green-500" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleRefresh}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsFullscreen(!isFullscreen)}
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 flex overflow-hidden">
        {isFullscreen ? (
          <iframe
            ref={iframeRef}
            title="Code Preview"
            sandbox="allow-scripts allow-same-origin allow-modals"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <Tabs defaultValue="preview" className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent">
              <TabsTrigger value="preview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="console" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500">
                <Terminal className="h-4 w-4 mr-2" />
                Console
                {consoleLogs.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {consoleLogs.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="preview" className="flex-1 m-0 p-0">
              <iframe
                ref={iframeRef}
                title="Code Preview"
                sandbox="allow-scripts allow-same-origin allow-modals"
                className="w-full h-full border-0 bg-white"
              />
            </TabsContent>

            <TabsContent value="console" className="flex-1 m-0 p-0 bg-slate-950">
              <ScrollArea className="h-full">
                <div className="p-2 space-y-1 font-mono text-xs">
                  {consoleLogs.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Console output will appear here</p>
                    </div>
                  ) : (
                    consoleLogs.map((log, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "px-2 py-1 rounded",
                          log.type === 'error' && "bg-red-500/10 text-red-400",
                          log.type === 'warn' && "bg-yellow-500/10 text-yellow-400",
                          log.type === 'log' && "text-slate-300"
                        )}
                      >
                        <span className="text-slate-500 mr-2">
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
    </div>
  );
<<<<<<< Updated upstream
>>>>>>> Stashed changes
=======
>>>>>>> Stashed changes
}
