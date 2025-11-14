import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SelfHealRequestPayload {
  filePath: string;
  fileContent: string;
  errors: LintErrorPayload[];
  issueType: string;
  repoContext?: string;
}

interface LintErrorPayload {
  line?: number;
  column?: number;
  message: string;
  rule?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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

    const {
      filePath,
      fileContent,
      errors,
      issueType,
      repoContext
    } = (await req.json()) as SelfHealRequestPayload;

    console.log(`Self-healing ${issueType} errors in ${filePath}`);
    console.log(`Errors to fix: ${errors.length}`);

    // Build comprehensive prompt
    const errorList = errors.map((issue) => 
      `Line ${issue.line ?? 'unknown'}: ${issue.message} (${issue.rule ?? 'unknown rule'})`
    ).join('\n');

    const prompt = `You are an expert TypeScript/JavaScript developer. Fix the following code quality issues.

File: ${filePath}
Issue Type: ${issueType}

Current Code:
\`\`\`typescript
${fileContent}
\`\`\`

Errors to Fix:
${errorList}

${repoContext ? `Repository Context:\n${repoContext}\n` : ''}

Instructions:
1. Fix ALL listed errors while preserving functionality
2. Maintain existing code style and formatting
3. Add proper type annotations where needed
4. Handle null/undefined cases appropriately for strictNullChecks
5. Remove unused variables/imports
6. Ensure the code compiles without errors

Return ONLY the fixed code without explanations or markdown formatting.`;

    // Call Claude for code fixes
    const awsRegion = Deno.env.get('AWS_REGION') || 'us-east-1';
    const modelId = 'anthropic.claude-sonnet-4-20250514-v1:0';
    const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${modelId}/invoke`;

    const bedrockPayload = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 8000,
      temperature: 0,
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
      throw new Error('Failed to generate fixes');
    }

    const bedrockResult = await bedrockResponse.json();
    let fixedCode = bedrockResult.content[0].text;

    // Remove code fences if present
    fixedCode = fixedCode.replace(/^```(?:typescript|javascript|ts|js)?\n/, '');
    fixedCode = fixedCode.replace(/\n```$/, '');

    console.log('Generated fixed code, length:', fixedCode.length);

    // Mark issues as fixed in database
    for (const issue of errors) {
      await supabase
        .from('code_quality_issues')
        .update({
          auto_fix_attempted: true,
          fixed_at: new Date().toISOString(),
        })
        .match({
          user_id: user.id,
          file_path: filePath,
          line_number: issue.line,
          message: issue.message,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        fixedCode,
        errorsFixed: errors.length,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in self-heal-code:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: message,
        details: String(error)
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
