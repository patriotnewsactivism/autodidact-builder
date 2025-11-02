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
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!LOVABLE_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { taskId } = await req.json();

    console.log('Processing task:', taskId);

    // Get task details
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      throw new Error('Task not found');
    }

    // Update task status to processing
    await supabase
      .from('tasks')
      .update({ 
        status: 'processing',
        started_at: new Date().toISOString()
      })
      .eq('id', taskId);

    // Add activity
    await supabase.from('activities').insert({
      user_id: task.user_id,
      task_id: taskId,
      type: 'ai',
      message: `AI analyzing: ${task.instruction}`,
      status: 'progress'
    });

    // Call Lovable AI to process the task
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { 
            role: 'system', 
            content: `You are an autonomous AI development agent. Analyze tasks and provide detailed, actionable solutions. 
            Focus on:
            1. Understanding the user's request
            2. Breaking it down into steps
            3. Identifying potential challenges
            4. Suggesting implementation approach
            5. Providing code examples when relevant
            Keep responses clear and practical.` 
          },
          { 
            role: 'user', 
            content: task.instruction 
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      await supabase.from('tasks').update({ 
        status: 'failed',
        error_message: `AI API error: ${aiResponse.status}`,
        completed_at: new Date().toISOString()
      }).eq('id', taskId);

      await supabase.from('activities').insert({
        user_id: task.user_id,
        task_id: taskId,
        type: 'error',
        message: 'AI processing failed',
        status: 'error'
      });

      return new Response(JSON.stringify({ error: 'AI processing failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResponse.json();
    const result = aiData.choices[0].message.content;

    console.log('AI processing completed');

    // Update task with result
    await supabase
      .from('tasks')
      .update({ 
        status: 'completed',
        result: result,
        completed_at: new Date().toISOString()
      })
      .eq('id', taskId);

    // Add success activity
    await supabase.from('activities').insert({
      user_id: task.user_id,
      task_id: taskId,
      type: 'success',
      message: `Task completed: ${task.instruction}`,
      status: 'success'
    });

    // Store learning in knowledge base
    await supabase.from('knowledge_nodes').insert({
      user_id: task.user_id,
      title: task.instruction.substring(0, 100),
      content: result,
      category: 'task_learning',
      confidence_score: 80,
      usage_count: 1
    });

    return new Response(JSON.stringify({ 
      success: true, 
      result: result 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});