import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Chunk text into smaller pieces for embeddings
function chunkText(text: string, maxChunkSize: number = 1000): string[] {
  const chunks: string[] = [];
  const lines = text.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    if (currentChunk.length + line.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line + '\n';
    } else {
      currentChunk += line + '\n';
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

// Get file language from path
function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'java': 'java',
    'go': 'go',
    'rs': 'rust',
    'cpp': 'cpp',
    'c': 'c',
    'md': 'markdown',
    'json': 'json',
  };
  return languageMap[ext || ''] || 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase not configured');
    }
    
    const { userId, repoFullName, branch, files } = await req.json();
    
    if (!userId || !repoFullName || !branch || !Array.isArray(files)) {
      throw new Error('Missing required parameters: userId, repoFullName, branch, files');
    }
    
    console.log(`[Create Embeddings] Processing ${files.length} files for ${repoFullName}/${branch}`);
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Delete existing embeddings for this repo/branch
    await supabase
      .from('codebase_embeddings')
      .delete()
      .eq('user_id', userId)
      .eq('repo_full_name', repoFullName)
      .eq('branch', branch);
    
    let totalChunks = 0;
    const embeddingRecords = [];
    
    for (const file of files) {
      const { path, content } = file;
      if (!path || !content) continue;
      
      const language = getLanguage(path);
      const chunks = chunkText(content);
      
      console.log(`[Create Embeddings] ${path}: ${chunks.length} chunks`);
      
      for (let i = 0; i < chunks.length; i++) {
        embeddingRecords.push({
          user_id: userId,
          file_path: path,
          repo_full_name: repoFullName,
          branch: branch,
          content_chunk: chunks[i],
          chunk_index: i,
          language: language,
          metadata: {
            total_chunks: chunks.length,
            file_size: content.length,
          },
        });
        totalChunks++;
      }
    }
    
    // Insert embeddings in batches
    const batchSize = 100;
    for (let i = 0; i < embeddingRecords.length; i += batchSize) {
      const batch = embeddingRecords.slice(i, i + batchSize);
      const { error } = await supabase
        .from('codebase_embeddings')
        .insert(batch);
      
      if (error) {
        console.error('[Create Embeddings] Insert error:', error);
        throw error;
      }
    }
    
    console.log(`[Create Embeddings] Created ${totalChunks} chunks from ${files.length} files`);
    
    return new Response(
      JSON.stringify({
        success: true,
        files_processed: files.length,
        total_chunks: totalChunks,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Create Embeddings] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
