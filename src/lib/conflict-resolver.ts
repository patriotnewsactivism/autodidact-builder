import { supabase } from '@/integrations/supabase/client';

export interface ConflictFile {
  path: string;
  content: string;
  hasConflict: boolean;
}

export interface ConflictResolution {
  files: Array<{
    path: string;
    resolvedContent: string;
    explanation: string;
  }>;
  summary: string;
}

/**
 * Detect if files have merge conflict markers
 */
export function detectConflicts(files: Record<string, string>): ConflictFile[] {
  const conflictMarkerRegex = /^<{7}.*\n[\s\S]*?={7}\n[\s\S]*?>{7}/m;
  
  return Object.entries(files).map(([path, content]) => ({
    path,
    content,
    hasConflict: conflictMarkerRegex.test(content),
  }));
}

/**
 * Extract diff content from conflicting files
 */
export function extractConflictDiff(files: ConflictFile[]): string {
  return files
    .filter(f => f.hasConflict)
    .map(f => {
      const lines = f.content.split('\n');
      const conflictLines: string[] = [];
      let inConflict = false;
      
      lines.forEach((line, idx) => {
        if (line.startsWith('<<<<<<<')) {
          inConflict = true;
          conflictLines.push(`\n=== ${f.path} (Line ${idx + 1}) ===`);
        }
        if (inConflict) {
          conflictLines.push(line);
        }
        if (line.startsWith('>>>>>>>')) {
          inConflict = false;
        }
      });
      
      return conflictLines.join('\n');
    })
    .join('\n\n');
}

/**
 * Create a conflict resolution task
 */
export async function createConflictTask(
  repoOwner: string,
  repoName: string,
  branch: string,
  conflictingFiles: string[],
  diffContent: string
): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('User not authenticated');
      return null;
    }

    const { data, error } = await supabase
      .from('conflict_resolution_tasks')
      .insert([{
        user_id: user.id,
        repo_owner: repoOwner,
        repo_name: repoName,
        branch,
        conflicting_files: conflictingFiles as any,
        diff_content: diffContent,
        resolution_status: 'pending',
      }])
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create conflict task:', error);
      return null;
    }

    return data.id;
  } catch (error) {
    console.error('Error creating conflict task:', error);
    return null;
  }
}

/**
 * Resolve conflicts using AI
 */
export async function resolveConflicts(
  conflictId: string,
  repoOwner: string,
  repoName: string,
  branch: string,
  conflictingFiles: string[],
  diffContent: string
): Promise<ConflictResolution | null> {
  try {
    const { data, error } = await supabase.functions.invoke('resolve-conflicts', {
      body: {
        conflictId,
        repoOwner,
        repoName,
        branch,
        conflictingFiles,
        diffContent,
      },
    });

    if (error) {
      console.error('Failed to resolve conflicts:', error);
      return null;
    }

    return data.resolution;
  } catch (error) {
    console.error('Error resolving conflicts:', error);
    return null;
  }
}

/**
 * Check for pending conflict tasks
 */
export async function getPendingConflicts(): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('conflict_resolution_tasks')
      .select('*')
      .eq('resolution_status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch pending conflicts:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching pending conflicts:', error);
    return [];
  }
}
