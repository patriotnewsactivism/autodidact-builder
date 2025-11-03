import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AWS Bedrock Model IDs
const MODELS = {
  'claude-sonnet-4.5': 'anthropic.claude-sonnet-4-5-v2:0',
  'claude-sonnet-3.5': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
  'claude-haiku': 'anthropic.claude-3-haiku-20240307-v1:0',
  'titan-text': 'amazon.titan-text-express-v1',
  'llama-3-70b': 'meta.llama3-70b-instruct-v1:0',
  'llama-3-8b': 'meta.llama3-8b-instruct-v1:0',
} as const;

type ModelName = keyof typeof MODELS;

interface BedrockMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface BedrockStreamChunk {
  type: string;
  delta?: {
    type: string;
    text?: string;
  };
  contentBlockIndex?: number;
  index?: number;
}

const AWS_REGION = Deno.env.get('AWS_REGION') || 'us-east-1';
const AWS_ACCESS_KEY_ID = Deno.env.get('AWS_ACCESS_KEY_ID');
const AWS_SECRET_ACCESS_KEY = Deno.env.get('AWS_SECRET_ACCESS_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// AWS Signature V4 implementation for Bedrock
async function signRequest(
  method: string,
  url: string,
  body: string,
  headers: Record<string, string>
): Promise<Record<string, string>> {
  const { createHash, createHmac } = await import('node:crypto');
  
  const urlObj = new URL(url);
  const service = 'bedrock';
  const region = AWS_REGION;
  
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  
  const canonicalUri = urlObj.pathname;
  const canonicalQuerystring = '';
  const canonicalHeaders = `host:${urlObj.host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  
  const payloadHash = createHash('sha256').update(body).digest('hex');
  
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  
  const getSignatureKey = (key: string, dateStamp: string, regionName: string, serviceName: string) => {
    const kDate = createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
    const kRegion = createHmac('sha256', kDate).update(regionName).digest();
    const kService = createHmac('sha256', kRegion).update(serviceName).digest();
    const kSigning = createHmac('sha256', kService).update('aws4_request').digest();
    return kSigning;
  };
  
  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY!, dateStamp, region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  
  const authorizationHeader = `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  
  return {
    ...headers,
    'X-Amz-Date': amzDate,
    'Authorization': authorizationHeader,
  };
}

async function callBedrockStreaming(
  model: string,
  messages: BedrockMessage[],
  systemPrompt: string,
  temperature: number = 0.7,
  maxTokens: number = 4096
): Promise<ReadableStream<Uint8Array>> {
  const endpoint = `https://bedrock-runtime.${AWS_REGION}.amazonaws.com/model/${model}/converse-stream`;
  
  const body = JSON.stringify({
    modelId: model,
    messages: messages.map(msg => ({
      role: msg.role,
      content: [{ text: msg.content }]
    })),
    system: [{ text: systemPrompt }],
    inferenceConfig: {
      temperature,
      maxTokens,
      topP: 0.9,
    },
  });
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };
  
  const signedHeaders = await signRequest('POST', endpoint, body, headers);
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: signedHeaders,
    body,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AWS Bedrock error: ${error}`);
  }
  
  return response.body!;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error('AWS credentials not configured');
    }
    
    const { 
      messages, 
      systemPrompt = 'You are AutoDidact, an expert autonomous coding agent.',
      model = 'claude-sonnet-4.5' as ModelName,
      temperature = 0.7,
      maxTokens = 4096,
      userId,
      taskId,
      stream = true,
    } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      throw new Error('Messages array required');
    }
    
    const modelId = MODELS[model as ModelName] || MODELS['claude-sonnet-4.5'];
    const startTime = Date.now();
    
    console.log(`[Bedrock Agent] Using model: ${model} (${modelId})`);
    console.log(`[Bedrock Agent] Processing ${messages.length} messages`);
    
    if (stream) {
      // Streaming response
      const bedrockStream = await callBedrockStreaming(
        modelId,
        messages,
        systemPrompt,
        temperature,
        maxTokens
      );
      
      const reader = bedrockStream.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      
      let totalTokensInput = 0;
      let totalTokensOutput = 0;
      let fullResponse = '';
      
      const stream = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n').filter(line => line.trim());
              
              for (const line of lines) {
                if (line.startsWith(':event-type')) {
                  continue; // Skip event type headers
                }
                
                if (line.startsWith(':content-type')) {
                  continue; // Skip content type headers
                }
                
                if (line.startsWith('data:')) {
                  try {
                    const jsonStr = line.slice(5).trim();
                    if (!jsonStr) continue;
                    
                    const data: BedrockStreamChunk = JSON.parse(jsonStr);
                    
                    if (data.delta?.text) {
                      fullResponse += data.delta.text;
                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: data.delta.text })}\n\n`)
                      );
                    }
                    
                    // Track tokens (approximation)
                    if (data.type === 'content_block_start') {
                      totalTokensInput += Math.ceil(JSON.stringify(messages).length / 4);
                    }
                    if (data.delta?.text) {
                      totalTokensOutput += Math.ceil(data.delta.text.length / 4);
                    }
                  } catch (e) {
                    console.error('[Bedrock Agent] Parse error:', e);
                  }
                }
              }
            }
            
            // Log performance metrics
            const latency = Date.now() - startTime;
            const costUsd = calculateCost(model as ModelName, totalTokensInput, totalTokensOutput);
            
            console.log(`[Bedrock Agent] Completed in ${latency}ms`);
            console.log(`[Bedrock Agent] Tokens: ${totalTokensInput} in, ${totalTokensOutput} out`);
            console.log(`[Bedrock Agent] Cost: $${costUsd.toFixed(6)}`);
            
            // Store metrics if user/task provided
            if (userId && taskId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
              try {
                const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
                const { error: metricsError } = await supabase.from('agent_performance_metrics').insert({
                  user_id: userId,
                  task_id: taskId,
                  model_used: model,
                  tokens_input: totalTokensInput,
                  tokens_output: totalTokensOutput,
                  cost_usd: costUsd,
                  latency_ms: latency,
                  success_rate: 100,
                });
                if (metricsError) {
                  console.error('Failed to store metrics:', metricsError);
                }
                
                // Store conversation memory
                const { error: convError } = await supabase.from('conversation_memory').insert([
                  {
                    user_id: userId,
                    task_id: taskId,
                    role: 'user',
                    content: messages[messages.length - 1]?.content || '',
                  },
                  {
                    user_id: userId,
                    task_id: taskId,
                    role: 'assistant',
                    content: fullResponse,
                  },
                ]);
                if (convError) {
                  console.error('Failed to store conversation:', convError);
                }
              } catch (err) {
                console.error('Failed to store data:', err);
              }
            }
            
            controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
            controller.close();
          } catch (error) {
            console.error('[Bedrock Agent] Stream error:', error);
            controller.error(error);
          }
        },
      });
      
      return new Response(stream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Non-streaming response (fallback)
      throw new Error('Non-streaming mode not yet implemented for Bedrock');
    }
  } catch (error) {
    console.error('[Bedrock Agent] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Cost calculation per model (approximate)
function calculateCost(model: ModelName, inputTokens: number, outputTokens: number): number {
  const pricing = {
    'claude-sonnet-4.5': { input: 0.003, output: 0.015 }, // $3/$15 per 1M tokens
    'claude-sonnet-3.5': { input: 0.003, output: 0.015 },
    'claude-haiku': { input: 0.00025, output: 0.00125 },
    'titan-text': { input: 0.0002, output: 0.0006 },
    'llama-3-70b': { input: 0.00195, output: 0.00256 },
    'llama-3-8b': { input: 0.0003, output: 0.0006 },
  };
  
  const costs = pricing[model] || pricing['claude-sonnet-4.5'];
  return (inputTokens / 1000000) * costs.input + (outputTokens / 1000000) * costs.output;
}
