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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      analytics_snapshot_runs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          run_id: string
          scope_key: string
          snapshot_type: string
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          run_id?: string
          scope_key: string
          snapshot_type: string
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          run_id?: string
          scope_key?: string
          snapshot_type?: string
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      analytics_snapshots: {
        Row: {
          as_of_ts: string
          created_at: string
          payload: Json
          scope_key: string
          snapshot_type: string
          status: string
          updated_at: string
        }
        Insert: {
          as_of_ts?: string
          created_at?: string
          payload?: Json
          scope_key: string
          snapshot_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          as_of_ts?: string
          created_at?: string
          payload?: Json
          scope_key?: string
          snapshot_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      oanda_orders: {
        Row: {
          agent_id: string | null
          closed_at: string | null
          confidence_score: number | null
          confirmation_tf_used: string | null
          created_at: string
          currency_pair: string
          direction: string
          direction_engine: string
          direction_tf_used: string | null
          entry_price: number | null
          environment: string
          error_message: string | null
          execution_quality_score: number | null
          exit_price: number | null
          fill_latency_ms: number | null
          friction_score: number | null
          gate_reasons: string[] | null
          gate_result: string | null
          governance_composite: number | null
          governance_payload: Json | null
          id: string
          idempotency_key: string | null
          oanda_order_id: string | null
          oanda_trade_id: string | null
          quantlabs_bias: string | null
          quantlabs_confidence: number | null
          regime_label: string | null
          requested_price: number | null
          session_label: string | null
          signal_id: string
          slippage_pips: number | null
          spread_at_entry: number | null
          status: string
          units: number
          updated_at: string
          user_id: string
          variant_id: string
        }
        Insert: {
          agent_id?: string | null
          closed_at?: string | null
          confidence_score?: number | null
          confirmation_tf_used?: string | null
          created_at?: string
          currency_pair: string
          direction: string
          direction_engine?: string
          direction_tf_used?: string | null
          entry_price?: number | null
          environment?: string
          error_message?: string | null
          execution_quality_score?: number | null
          exit_price?: number | null
          fill_latency_ms?: number | null
          friction_score?: number | null
          gate_reasons?: string[] | null
          gate_result?: string | null
          governance_composite?: number | null
          governance_payload?: Json | null
          id?: string
          idempotency_key?: string | null
          oanda_order_id?: string | null
          oanda_trade_id?: string | null
          quantlabs_bias?: string | null
          quantlabs_confidence?: number | null
          regime_label?: string | null
          requested_price?: number | null
          session_label?: string | null
          signal_id: string
          slippage_pips?: number | null
          spread_at_entry?: number | null
          status?: string
          units: number
          updated_at?: string
          user_id: string
          variant_id?: string
        }
        Update: {
          agent_id?: string | null
          closed_at?: string | null
          confidence_score?: number | null
          confirmation_tf_used?: string | null
          created_at?: string
          currency_pair?: string
          direction?: string
          direction_engine?: string
          direction_tf_used?: string | null
          entry_price?: number | null
          environment?: string
          error_message?: string | null
          execution_quality_score?: number | null
          exit_price?: number | null
          fill_latency_ms?: number | null
          friction_score?: number | null
          gate_reasons?: string[] | null
          gate_result?: string | null
          governance_composite?: number | null
          governance_payload?: Json | null
          id?: string
          idempotency_key?: string | null
          oanda_order_id?: string | null
          oanda_trade_id?: string | null
          quantlabs_bias?: string | null
          quantlabs_confidence?: number | null
          regime_label?: string | null
          requested_price?: number | null
          session_label?: string | null
          signal_id?: string
          slippage_pips?: number | null
          spread_at_entry?: number | null
          status?: string
          units?: number
          updated_at?: string
          user_id?: string
          variant_id?: string
        }
        Relationships: []
      }
      oanda_orders_daily_rollup: {
        Row: {
          agent_id: string
          avg_slippage: number
          avg_spread: number
          created_at: string
          currency_pair: string
          direction: string
          environment: string
          gross_loss_pips: number
          gross_profit_pips: number
          losses: number
          max_dd_pips: number
          net_pips: number
          regime_label: string
          rollup_date: string
          session_label: string
          trades: number
          wins: number
        }
        Insert: {
          agent_id: string
          avg_slippage?: number
          avg_spread?: number
          created_at?: string
          currency_pair: string
          direction: string
          environment: string
          gross_loss_pips?: number
          gross_profit_pips?: number
          losses?: number
          max_dd_pips?: number
          net_pips?: number
          regime_label?: string
          rollup_date: string
          session_label?: string
          trades?: number
          wins?: number
        }
        Update: {
          agent_id?: string
          avg_slippage?: number
          avg_spread?: number
          created_at?: string
          currency_pair?: string
          direction?: string
          environment?: string
          gross_loss_pips?: number
          gross_profit_pips?: number
          losses?: number
          max_dd_pips?: number
          net_pips?: number
          regime_label?: string
          rollup_date?: string
          session_label?: string
          trades?: number
          wins?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          last_active_at: string | null
          last_login_at: string | null
          plan: Database["public"]["Enums"]["app_plan"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_active_at?: string | null
          last_login_at?: string | null
          plan?: Database["public"]["Enums"]["app_plan"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_active_at?: string | null
          last_login_at?: string | null
          plan?: Database["public"]["Enums"]["app_plan"]
          user_id?: string
        }
        Relationships: []
      }
      stripe_customers: {
        Row: {
          current_period_end: string | null
          current_period_start: string | null
          id: string
          last_payment_status: string | null
          price_id: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at: string
          user_id: string
        }
        Insert: {
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_status?: string | null
          price_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string
          user_id: string
        }
        Update: {
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          last_payment_status?: string | null
          price_id?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          created_at: string
          error: string | null
          id: string
          payload: Json
          processed: boolean
          stripe_event_id: string
          type: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          stripe_event_id: string
          type: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          payload?: Json
          processed?: boolean
          stripe_event_id?: string
          type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_agent_simulator_stats: {
        Args: { p_user_id: string }
        Returns: {
          agent_id: string
          gross_loss: number
          gross_profit: number
          long_count: number
          long_net: number
          long_wins: number
          net_pips: number
          short_count: number
          short_net: number
          short_wins: number
          total_trades: number
          win_count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_plan: "free" | "premium"
      app_role: "admin" | "user"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
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
      app_plan: ["free", "premium"],
      app_role: ["admin", "user"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
    },
  },
} as const
