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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          block_note: string | null
          cancel_fee: number
          cancelled_at: string | null
          cancelled_by: Database["public"]["Enums"]["booking_actor"] | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          court_fee: number
          created_at: string
          end_at: string
          guest_token_hash: string | null
          hold_expires_at: string | null
          hourly_rate: number
          hours: number
          id: string
          kind: Database["public"]["Enums"]["booking_kind"]
          paddle_fee: number
          paddle_rented: boolean
          payment_proof_path: string | null
          payment_submitted_at: string | null
          ref_code: string
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          status_before_request:
            | Database["public"]["Enums"]["booking_status"]
            | null
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          block_note?: string | null
          cancel_fee?: number
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["booking_actor"] | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          court_fee?: number
          created_at?: string
          end_at: string
          guest_token_hash?: string | null
          hold_expires_at?: string | null
          hourly_rate?: number
          hours: number
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          paddle_fee?: number
          paddle_rented?: boolean
          payment_proof_path?: string | null
          payment_submitted_at?: string | null
          ref_code: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          status_before_request?:
            | Database["public"]["Enums"]["booking_status"]
            | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          block_note?: string | null
          cancel_fee?: number
          cancelled_at?: string | null
          cancelled_by?: Database["public"]["Enums"]["booking_actor"] | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          court_fee?: number
          created_at?: string
          end_at?: string
          guest_token_hash?: string | null
          hold_expires_at?: string | null
          hourly_rate?: number
          hours?: number
          id?: string
          kind?: Database["public"]["Enums"]["booking_kind"]
          paddle_fee?: number
          paddle_rented?: boolean
          payment_proof_path?: string | null
          payment_submitted_at?: string | null
          ref_code?: string
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          status_before_request?:
            | Database["public"]["Enums"]["booking_status"]
            | null
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string
          created_at: string
          deleted_at: string | null
          feedback_id: string | null
          id: string
          post_id: string | null
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          deleted_at?: string | null
          feedback_id?: string | null
          id?: string
          post_id?: string | null
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          deleted_at?: string | null
          feedback_id?: string | null
          id?: string
          post_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          is_anonymous: boolean
          message: string
          owner_reply: string | null
          replied_at: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_anonymous?: boolean
          message: string
          owner_reply?: string | null
          replied_at?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_anonymous?: boolean
          message?: string
          owner_reply?: string | null
          replied_at?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_photos: {
        Row: {
          created_at: string
          feedback_id: string
          id: string
          path: string
          position: number
        }
        Insert: {
          created_at?: string
          feedback_id: string
          id?: string
          path: string
          position: number
        }
        Update: {
          created_at?: string
          feedback_id?: string
          id?: string
          path?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_photos_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      post_photos: {
        Row: {
          created_at: string
          id: string
          path: string
          position: number
          post_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          path: string
          position: number
          post_id: string
        }
        Update: {
          created_at?: string
          id?: string
          path?: string
          position?: number
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_photos_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string
          created_at: string
          deleted_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          caption?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          caption?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      reactions: {
        Row: {
          created_at: string
          feedback_id: string | null
          id: string
          post_id: string | null
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_id?: string | null
          id?: string
          post_id?: string | null
          type: Database["public"]["Enums"]["reaction_type"]
          user_id: string
        }
        Update: {
          created_at?: string
          feedback_id?: string | null
          id?: string
          post_id?: string | null
          type?: Database["public"]["Enums"]["reaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reactions_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          booking_id: string
          cancel_fee: number
          completed_at: string | null
          completed_by: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decline_reason: string | null
          gcash_name: string | null
          gcash_number: string | null
          id: string
          refund_amount: number
          refund_proof_path: string | null
          requested_at: string
          status: Database["public"]["Enums"]["refund_status"]
          updated_at: string
        }
        Insert: {
          booking_id: string
          cancel_fee: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decline_reason?: string | null
          gcash_name?: string | null
          gcash_number?: string | null
          id?: string
          refund_amount: number
          refund_proof_path?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Update: {
          booking_id?: string
          cancel_fee?: number
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decline_reason?: string | null
          gcash_name?: string | null
          gcash_number?: string | null
          id?: string
          refund_amount?: number
          refund_proof_path?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["refund_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          cancel_cutoff_hours: number
          cancel_fee: number
          close_hour: number
          court_name: string
          gcash_qr_path: string | null
          hold_minutes: number
          hourly_rate: number
          id: boolean
          max_advance_days: number
          max_unpaid_bookings: number
          open_hour: number
          paddle_count: number
          paddle_fee: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cancel_cutoff_hours?: number
          cancel_fee?: number
          close_hour?: number
          court_name?: string
          gcash_qr_path?: string | null
          hold_minutes?: number
          hourly_rate?: number
          id?: boolean
          max_advance_days?: number
          max_unpaid_bookings?: number
          open_hour?: number
          paddle_count?: number
          paddle_fee?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cancel_cutoff_hours?: number
          cancel_fee?: number
          close_hour?: number
          court_name?: string
          gcash_qr_path?: string | null
          hold_minutes?: number
          hourly_rate?: number
          id?: boolean
          max_advance_days?: number
          max_unpaid_bookings?: number
          open_hour?: number
          paddle_count?: number
          paddle_fee?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_unpaid_booking: {
        Args: { p_booking_id: string; p_guest_token?: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
      check_payment_upload: {
        Args: { p_booking_id: string; p_guest_token?: string }
        Returns: boolean
      }
      claim_guest_bookings: { Args: { p_guest_token: string }; Returns: number }
      create_booking: {
        Args: {
          p_email?: string
          p_guest_token?: string
          p_hours: number
          p_name?: string
          p_paddles?: boolean
          p_phone?: string
          p_start_at: string
        }
        Returns: {
          booking_id: string
          hold_expires_at: string
          ref_code: string
          total: number
        }[]
      }
      get_availability: {
        Args: { p_day: string }
        Returns: {
          end_at: string
          start_at: string
        }[]
      }
      my_bookings: {
        Args: { p_guest_token?: string }
        Returns: {
          cancel_fee: number
          cancelled_at: string
          cancelled_by: Database["public"]["Enums"]["booking_actor"]
          contact_email: string
          contact_name: string
          contact_phone: string
          court_fee: number
          created_at: string
          end_at: string
          has_payment_proof: boolean
          hold_expires_at: string
          hourly_rate: number
          hours: number
          id: string
          is_guest: boolean
          paddle_fee: number
          paddle_rented: boolean
          payment_submitted_at: string
          ref_code: string
          reject_reason: string
          start_at: string
          status: Database["public"]["Enums"]["booking_status"]
          total: number
        }[]
      }
      submit_payment_proof: {
        Args: { p_booking_id: string; p_guest_token?: string; p_path: string }
        Returns: Database["public"]["Enums"]["booking_status"]
      }
    }
    Enums: {
      booking_actor: "customer" | "owner"
      booking_kind: "customer" | "block"
      booking_status:
        | "pending_payment"
        | "pending_review"
        | "confirmed"
        | "rejected"
        | "expired"
        | "cancelled"
        | "cancel_requested"
        | "blocked"
      feedback_status: "open" | "in_progress" | "resolved"
      reaction_type: "like" | "haha"
      refund_status: "requested" | "approved" | "declined" | "completed"
      user_role: "customer" | "owner"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      booking_actor: ["customer", "owner"],
      booking_kind: ["customer", "block"],
      booking_status: [
        "pending_payment",
        "pending_review",
        "confirmed",
        "rejected",
        "expired",
        "cancelled",
        "cancel_requested",
        "blocked",
      ],
      feedback_status: ["open", "in_progress", "resolved"],
      reaction_type: ["like", "haha"],
      refund_status: ["requested", "approved", "declined", "completed"],
      user_role: ["customer", "owner"],
    },
  },
} as const
