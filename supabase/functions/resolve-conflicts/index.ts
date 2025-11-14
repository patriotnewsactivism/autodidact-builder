import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { conflictId, conflictingFiles, diffContent, repoOwner, repoName, branch } = await req.json();

    console.log(`Resolving conflict for ${conflictingFiles.length} files`);

    // Prepare prompt for Claude
    const prompt = `You are an expert code merge conflict resolver. Analyze the following Git merge conflict and provide a clean resolution.

Repository: ${repoOwner}/${repoName}
Branch: ${branch}

Conflicting Files:
${conflictingFiles.map((f: string) => `- ${f}`).join('\n')}

Conflict Diff:
\`\`\`
${diffContent}
\`\`\`

Instructions:
1. Analyze both versions of the code (HEAD and incoming changes)
2. Understand the intent of each change
3. Merge the changes intelligently, preserving functionality from both sides
4. Remove all conflict markers (<<<<<<, ======, >>>>>>)
5. Ensure the code is syntactically correct
6. Maintain code style and formatting

Provide the fully resolved file content for each conflicting file.

Output format (JSON):
{
  "files": [
    {
      "path": "path/to/file.ts",
      "resolvedContent": "complete resolved file content",
      "explanation": "brief explanation of how the conflict was resolved"
    }
  ],
  "summary": "overall summary of the resolution strategy"
}`;

    // Call Bedrock Claude for conflict resolution
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';
    const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${modelId}/invoke`;

    const bedrockPayload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 8000,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    };

    const bedrockResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bedrockPayload),
    });

    if (!bedrockResponse.ok) {
      const error = await bedrockResponse.text();
      console.error('Bedrock error:', error);
      throw new Error('Failed to resolve conflict with AI');
    }

    const bedrockResult = await bedrockResponse.json();
    const aiResponse = bedrockResult.content[0].text;

    console.log('AI resolution response:', aiResponse);

    // Parse the AI response
    let resolution;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = aiResponse.match(/```json\n([\s\S]*?)\n```/) || 
                       aiResponse.match(/```\n([\s\S]*?)\n```/);
      const jsonText = jsonMatch ? jsonMatch[1] : aiResponse;
      resolution = JSON.parse(jsonText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      throw new Error('AI returned invalid response format');
    }

    // Store the resolution
    const { error: updateError } = await supabase
      .from('conflict_resolution_tasks')
      .update({
        resolution_status: 'resolved',
        resolved_content: resolution,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', conflictId);

    if (updateError) {
      console.error('Failed to update conflict task:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        resolution,
        message: 'Conflict resolved successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error: any) {
    console.error('Error in resolve-conflicts:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
