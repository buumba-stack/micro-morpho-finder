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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_chat_usage: {
        Row: {
          client_version: string | null
          created_at: string
          id: string
          model: string | null
          owner_exempt: boolean
          success: boolean
          user_id: string
        }
        Insert: {
          client_version?: string | null
          created_at?: string
          id?: string
          model?: string | null
          owner_exempt?: boolean
          success?: boolean
          user_id: string
        }
        Update: {
          client_version?: string | null
          created_at?: string
          id?: string
          model?: string | null
          owner_exempt?: boolean
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ai_review_audit: {
        Row: {
          charged: boolean
          client_version: string | null
          created_at: string
          error_code: string | null
          gateway_request_id: string | null
          id: string
          model: string | null
          owner_exempt: boolean
          remaining_after: number | null
          success: boolean
          user_id: string
        }
        Insert: {
          charged?: boolean
          client_version?: string | null
          created_at?: string
          error_code?: string | null
          gateway_request_id?: string | null
          id?: string
          model?: string | null
          owner_exempt?: boolean
          remaining_after?: number | null
          success?: boolean
          user_id: string
        }
        Update: {
          charged?: boolean
          client_version?: string | null
          created_at?: string
          error_code?: string | null
          gateway_request_id?: string | null
          id?: string
          model?: string | null
          owner_exempt?: boolean
          remaining_after?: number | null
          success?: boolean
          user_id?: string
        }
        Relationships: []
      }
      ai_review_credits: {
        Row: {
          created_at: string
          credits_granted: number
          credits_remaining: number
          successful_reviews: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_granted?: number
          credits_remaining?: number
          successful_reviews?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_granted?: number
          credits_remaining?: number
          successful_reviews?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analysis_batches: {
        Row: {
          acquisition_profile: string | null
          analysis_date: string | null
          created_at: string
          id: string
          microscope: string | null
          name: string
          objective: string | null
          protocol: string | null
          solution: string | null
          status: string
          threshold: number | null
          tissue: string | null
          um_per_px: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acquisition_profile?: string | null
          analysis_date?: string | null
          created_at?: string
          id?: string
          microscope?: string | null
          name: string
          objective?: string | null
          protocol?: string | null
          solution?: string | null
          status?: string
          threshold?: number | null
          tissue?: string | null
          um_per_px?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          acquisition_profile?: string | null
          analysis_date?: string | null
          created_at?: string
          id?: string
          microscope?: string | null
          name?: string
          objective?: string | null
          protocol?: string | null
          solution?: string | null
          status?: string
          threshold?: number | null
          tissue?: string | null
          um_per_px?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contaminant_families: {
        Row: {
          batch_id: string | null
          contaminant_type: string
          created_at: string
          id: string
          name: string
          notes: string | null
          protocol: string | null
          scope: string
          status: string
          tissue: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          contaminant_type?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          protocol?: string | null
          scope?: string
          status?: string
          tissue?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          contaminant_type?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          protocol?: string | null
          scope?: string
          status?: string
          tissue?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contaminant_families_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "analysis_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      contaminant_observations: {
        Row: {
          batch_id: string | null
          created_at: string
          family_id: string
          id: string
          import_fingerprint: string | null
          manually_confirmed: boolean
          notes: string | null
          particle_features: Json
          particle_id: string | null
          protocol: string | null
          source_image_id: string | null
          source_image_name: string | null
          source_type: string
          tissue: string | null
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          family_id: string
          id?: string
          import_fingerprint?: string | null
          manually_confirmed?: boolean
          notes?: string | null
          particle_features?: Json
          particle_id?: string | null
          protocol?: string | null
          source_image_id?: string | null
          source_image_name?: string | null
          source_type?: string
          tissue?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          family_id?: string
          id?: string
          import_fingerprint?: string | null
          manually_confirmed?: boolean
          notes?: string | null
          particle_features?: Json
          particle_id?: string | null
          protocol?: string | null
          source_image_id?: string | null
          source_image_name?: string | null
          source_type?: string
          tissue?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contaminant_observations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "analysis_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contaminant_observations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "contaminant_families"
            referencedColumns: ["id"]
          },
        ]
      }
      particle_decisions: {
        Row: {
          batch_id: string | null
          contaminant_family_id: string | null
          contaminant_family_id_snapshot: string | null
          contaminant_family_name_snapshot: string | null
          contaminant_scope: string | null
          created_at: string
          decision: string
          decision_source: string
          exclusion_reason: string | null
          id: string
          match_method: string | null
          matcher_version: string | null
          particle_features: Json | null
          particle_id: string | null
          procedural_blank_support: number | null
          proposed_confidence: number | null
          proposed_prediction: string | null
          source_image_id: string | null
          source_image_name: string | null
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          contaminant_family_id?: string | null
          contaminant_family_id_snapshot?: string | null
          contaminant_family_name_snapshot?: string | null
          contaminant_scope?: string | null
          created_at?: string
          decision: string
          decision_source?: string
          exclusion_reason?: string | null
          id?: string
          match_method?: string | null
          matcher_version?: string | null
          particle_features?: Json | null
          particle_id?: string | null
          procedural_blank_support?: number | null
          proposed_confidence?: number | null
          proposed_prediction?: string | null
          source_image_id?: string | null
          source_image_name?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string | null
          contaminant_family_id?: string | null
          contaminant_family_id_snapshot?: string | null
          contaminant_family_name_snapshot?: string | null
          contaminant_scope?: string | null
          created_at?: string
          decision?: string
          decision_source?: string
          exclusion_reason?: string | null
          id?: string
          match_method?: string | null
          matcher_version?: string | null
          particle_features?: Json | null
          particle_id?: string | null
          procedural_blank_support?: number | null
          proposed_confidence?: number | null
          proposed_prediction?: string | null
          source_image_id?: string | null
          source_image_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "particle_decisions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "analysis_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "particle_decisions_contaminant_family_id_fkey"
            columns: ["contaminant_family_id"]
            isOneToOne: false
            referencedRelation: "contaminant_families"
            referencedColumns: ["id"]
          },
        ]
      }
      particle_predictions: {
        Row: {
          batch_id: string | null
          confidence: number | null
          contaminant_family_id: string | null
          contaminant_family_name_snapshot: string | null
          created_at: string
          details: Json | null
          id: string
          method: string
          model_version: string | null
          particle_id: string | null
          prediction: string
          source_image_id: string | null
          source_image_name: string | null
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          confidence?: number | null
          contaminant_family_id?: string | null
          contaminant_family_name_snapshot?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          method?: string
          model_version?: string | null
          particle_id?: string | null
          prediction: string
          source_image_id?: string | null
          source_image_name?: string | null
          user_id: string
        }
        Update: {
          batch_id?: string | null
          confidence?: number | null
          contaminant_family_id?: string | null
          contaminant_family_name_snapshot?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          method?: string
          model_version?: string | null
          particle_id?: string | null
          prediction?: string
          source_image_id?: string | null
          source_image_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "particle_predictions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "analysis_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "particle_predictions_contaminant_family_id_fkey"
            columns: ["contaminant_family_id"]
            isOneToOne: false
            referencedRelation: "contaminant_families"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reviewer_ai_usage: {
        Row: {
          created_at: string
          feature: string
          id: string
          success: boolean
        }
        Insert: {
          created_at?: string
          feature: string
          id?: string
          success?: boolean
        }
        Update: {
          created_at?: string
          feature?: string
          id?: string
          success?: boolean
        }
        Relationships: []
      }
      reviewer_auth_attempts: {
        Row: {
          created_at: string
          id: string
          success: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          success: boolean
        }
        Update: {
          created_at?: string
          id?: string
          success?: boolean
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_chat_recent_count: { Args: { _user_id: string }; Returns: number }
      commit_ai_review_success: { Args: { _user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_ai_unlimited: { Args: { _user_id: string }; Returns: boolean }
      release_ai_review_credit: { Args: { _user_id: string }; Returns: number }
      reserve_ai_review_credit: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "owner" | "admin" | "user"
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
    Enums: {
      app_role: ["owner", "admin", "user"],
    },
  },
} as const
