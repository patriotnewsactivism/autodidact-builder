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
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
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
}
