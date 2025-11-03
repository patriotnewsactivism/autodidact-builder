import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

interface SearchResult {
  file_path: string;
  content_chunk: string;
  language: string;
  chunk_index: number;
  relevance_score: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase not configured');
    }
    
    const { userId, repoFullName, branch, query, limit = 10 } = await req.json();
    
    if (!userId || !repoFullName || !branch || !query) {
      throw new Error('Missing required parameters: userId, repoFullName, branch, query');
    }
    
    console.log(`[Search Codebase] Searching for: "${query}" in ${repoFullName}/${branch}`);
    
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Simple text-based search (can be enhanced with vector search later)
    const { data, error } = await supabase
      .from('codebase_embeddings')
      .select('file_path, content_chunk, language, chunk_index')
      .eq('user_id', userId)
      .eq('repo_full_name', repoFullName)
      .eq('branch', branch)
      .textSearch('content_chunk', query, {
        type: 'websearch',
        config: 'english',
      })
      .limit(limit);
    
    if (error) {
      console.error('[Search Codebase] Search error:', error);
      throw error;
    }
    
    // Calculate relevance scores (simple keyword matching)
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 2);
    
    const results: SearchResult[] = (data || []).map(item => {
      const contentLower = item.content_chunk.toLowerCase();
      let score = 0;
      
      // Score based on keyword matches
      for (const word of queryWords) {
        const matches = (contentLower.match(new RegExp(word, 'g')) || []).length;
        score += matches * 10;
      }
      
      // Boost score for exact phrase match
      if (contentLower.includes(queryLower)) {
        score += 50;
      }
      
      // Boost score for matches in file path
      if (item.file_path.toLowerCase().includes(queryLower)) {
        score += 30;
      }
      
      return {
        ...item,
        relevance_score: score,
      };
    });
    
    // Sort by relevance
    results.sort((a, b) => b.relevance_score - a.relevance_score);
    
    // Group by file and combine chunks
    const fileMap = new Map<string, SearchResult[]>();
    for (const result of results) {
      if (!fileMap.has(result.file_path)) {
        fileMap.set(result.file_path, []);
      }
      fileMap.get(result.file_path)!.push(result);
    }
    
    // Get full content for most relevant files
    const relevantFiles = Array.from(fileMap.entries())
      .map(([path, chunks]) => ({
        path,
        chunks: chunks.sort((a, b) => a.chunk_index - b.chunk_index),
        max_score: Math.max(...chunks.map(c => c.relevance_score)),
        language: chunks[0]?.language || 'unknown',
      }))
      .sort((a, b) => b.max_score - a.max_score)
      .slice(0, Math.ceil(limit / 2));
    
    console.log(`[Search Codebase] Found ${results.length} chunks in ${relevantFiles.length} files`);
    
    return new Response(
      JSON.stringify({
        success: true,
        results: relevantFiles.map(file => ({
          path: file.path,
          language: file.language,
          relevance_score: file.max_score,
          preview: file.chunks.slice(0, 3).map(c => c.content_chunk).join('\n...\n'),
        })),
        total_chunks: results.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[Search Codebase] Error:', error);
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
