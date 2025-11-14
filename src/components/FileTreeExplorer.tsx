/**
 * FileTreeExplorer - Interactive file tree navigation
 *
 * Features:
 * - Hierarchical file/folder display
 * - Expand/collapse folders
 * - File selection
 * - Search/filter
 * - File type icons
 */

import { useState, useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  Search, FileCode, FileJson, FileText, FileImage, Database
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileNode[];
  size?: number;
  modified?: Date;
}

interface FileTreeExplorerProps {
  files: FileNode[];
  onFileSelect?: (file: FileNode) => void;
  selectedPath?: string;
  className?: string;
}

const getFileIcon = (fileName: string) => {
  const ext = fileName.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'js':
    case 'jsx':
    case 'ts':
    case 'tsx':
      return <FileCode className="h-4 w-4 text-yellow-500" />;
    case 'json':
      return <FileJson className="h-4 w-4 text-green-500" />;
    case 'md':
    case 'txt':
      return <FileText className="h-4 w-4 text-blue-500" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
      return <FileImage className="h-4 w-4 text-purple-500" />;
    case 'sql':
    case 'db':
      return <Database className="h-4 w-4 text-cyan-500" />;
    default:
      return <File className="h-4 w-4 text-slate-400" />;
  }
};

function FileTreeNode({
  node,
  level = 0,
  onSelect,
  selectedPath,
}: {
  node: FileNode;
  level?: number;
  onSelect?: (file: FileNode) => void;
  selectedPath?: string;
}) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

  const isSelected = selectedPath === node.path;
  const hasChildren = node.children && node.children.length > 0;

  const handleClick = () => {
    if (node.type === 'folder') {
      setIsExpanded(!isExpanded);
    } else {
      onSelect?.(node);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-800/50 transition-colors",
          isSelected && "bg-purple-500/20 hover:bg-purple-500/30",
          level > 0 && "ml-4"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {node.type === 'folder' ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
            )}
            {isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-400 shrink-0" />
            ) : (
              <Folder className="h-4 w-4 text-blue-400 shrink-0" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className={cn(
          "text-sm truncate flex-1",
          node.type === 'folder' ? "text-slate-200 font-medium" : "text-slate-300"
        )}>
          {node.name}
        </span>
        {node.type === 'folder' && hasChildren && (
          <Badge variant="secondary" className="text-xs shrink-0">
            {node.children!.length}
          </Badge>
        )}
      </div>

      {node.type === 'folder' && isExpanded && hasChildren && (
        <div>
          {node.children!.map((child, idx) => (
            <FileTreeNode
              key={idx}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTreeExplorer({
  files,
  onFileSelect,
  selectedPath,
  className,
}: FileTreeExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter files based on search
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files;

    const query = searchQuery.toLowerCase();

    const filterNode = (node: FileNode): FileNode | null => {
      if (node.name.toLowerCase().includes(query)) {
        return node;
      }

      if (node.children) {
        const filteredChildren = node.children
          .map(filterNode)
          .filter(Boolean) as FileNode[];

        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren };
        }
      }

      return null;
    };

    return files.map(filterNode).filter(Boolean) as FileNode[];
  }, [files, searchQuery]);

  // Count total files
  const totalFiles = useMemo(() => {
    const count = (nodes: FileNode[]): number => {
      return nodes.reduce((sum, node) => {
        if (node.type === 'file') return sum + 1;
        if (node.children) return sum + count(node.children);
        return sum;
      }, 0);
    };
    return count(files);
  }, [files]);

  return (
    <div className={cn("flex flex-col h-full bg-slate-900/50 border-r border-slate-800", className)}>
      {/* Header */}
      <div className="p-3 border-b border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-200">Files</h3>
          <Badge variant="outline" className="text-xs">
            {totalFiles} files
          </Badge>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <File className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No files match your search' : 'No files to display'}
              </p>
            </div>
          ) : (
            filteredFiles.map((node, idx) => (
              <FileTreeNode
                key={idx}
                node={node}
                onSelect={onFileSelect}
                selectedPath={selectedPath}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
