export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          status: string
          task_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          status: string
          task_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          status?: string
          task_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_metrics: {
        Row: {
          ai_decisions: number | null
          autonomy_level: number | null
          id: string
          knowledge_nodes: number | null
          learning_score: number | null
          lines_changed: number | null
          tasks_completed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_decisions?: number | null
          autonomy_level?: number | null
          id?: string
          knowledge_nodes?: number | null
          learning_score?: number | null
          lines_changed?: number | null
          tasks_completed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_decisions?: number | null
          autonomy_level?: number | null
          id?: string
          knowledge_nodes?: number | null
          learning_score?: number | null
          lines_changed?: number | null
          tasks_completed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      agent_performance_metrics: {
        Row: {
          cost_usd: number | null
          created_at: string | null
          error_count: number | null
          id: string
          latency_ms: number | null
          metadata: Json | null
          model_used: string
          success_rate: number | null
          task_id: string | null
          tokens_input: number | null
          tokens_output: number | null
          user_id: string
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string | null
          error_count?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          model_used: string
          success_rate?: number | null
          task_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id: string
        }
        Update: {
          cost_usd?: number | null
          created_at?: string | null
          error_count?: number | null
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          model_used?: string
          success_rate?: number | null
          task_id?: string | null
          tokens_input?: number | null
          tokens_output?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_performance_metrics_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      codebase_embeddings: {
        Row: {
          branch: string
          chunk_index: number
          content_chunk: string
          created_at: string | null
          file_path: string
          id: string
          language: string | null
          metadata: Json | null
          repo_full_name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          branch: string
          chunk_index: number
          content_chunk: string
          created_at?: string | null
          file_path: string
          id?: string
          language?: string | null
          metadata?: Json | null
          repo_full_name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          branch?: string
          chunk_index?: number
          content_chunk?: string
          created_at?: string | null
          file_path?: string
          id?: string
          language?: string | null
          metadata?: Json | null
          repo_full_name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      conversation_memory: {
        Row: {
          content: string
          created_at: string | null
          id: string
          metadata: Json | null
          role: string
          task_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role: string
          task_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          role?: string
          task_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_memory_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_nodes: {
        Row: {
          category: string | null
          confidence_score: number | null
          content: string | null
          created_at: string | null
          id: string
          title: string
          updated_at: string | null
          usage_count: number | null
          user_id: string
        }
        Insert: {
          category?: string | null
          confidence_score?: number | null
          content?: string | null
          created_at?: string | null
          id?: string
          title: string
          updated_at?: string | null
          usage_count?: number | null
          user_id: string
        }
        Update: {
          category?: string | null
          confidence_score?: number | null
          content?: string | null
          created_at?: string | null
          id?: string
          title?: string
          updated_at?: string | null
          usage_count?: number | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          instruction: string
          metadata: Json | null
          result: string | null
          started_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          instruction: string
          metadata?: Json | null
          result?: string | null
          started_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          instruction?: string
          metadata?: Json | null
          result?: string | null
          started_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
