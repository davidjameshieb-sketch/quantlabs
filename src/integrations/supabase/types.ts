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
      agent_configs: {
        Row: {
          agent_id: string
          config: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          agent_id: string
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string
          config?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agent_promotion_ledger: {
        Row: {
          agent_id: string
          avg_r_ratio: number
          created_at: string
          demoted_at: string | null
          demotion_reason: string | null
          expectancy_r: number
          gross_loss_pips: number
          gross_profit_pips: number
          id: string
          losses: number
          net_pips: number
          promoted_at: string | null
          promotion_reason: string | null
          sizing_multiplier: number
          strategy: string | null
          target_session: string | null
          tier: string
          total_trades: number
          updated_at: string
          win_rate: number
          wins: number
        }
        Insert: {
          agent_id: string
          avg_r_ratio?: number
          created_at?: string
          demoted_at?: string | null
          demotion_reason?: string | null
          expectancy_r?: number
          gross_loss_pips?: number
          gross_profit_pips?: number
          id?: string
          losses?: number
          net_pips?: number
          promoted_at?: string | null
          promotion_reason?: string | null
          sizing_multiplier?: number
          strategy?: string | null
          target_session?: string | null
          tier?: string
          total_trades?: number
          updated_at?: string
          win_rate?: number
          wins?: number
        }
        Update: {
          agent_id?: string
          avg_r_ratio?: number
          created_at?: string
          demoted_at?: string | null
          demotion_reason?: string | null
          expectancy_r?: number
          gross_loss_pips?: number
          gross_profit_pips?: number
          id?: string
          losses?: number
          net_pips?: number
          promoted_at?: string | null
          promotion_reason?: string | null
          sizing_multiplier?: number
          strategy?: string | null
          target_session?: string | null
          tier?: string
          total_trades?: number
          updated_at?: string
          win_rate?: number
          wins?: number
        }
        Relationships: []
      }
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
      canary_alerts: {
        Row: {
          acknowledged: boolean
          alert_type: string
          created_at: string
          current_value: number | null
          expires_at: string
          id: string
          message: string
          severity: string
          source: string
          threshold: number | null
        }
        Insert: {
          acknowledged?: boolean
          alert_type: string
          created_at?: string
          current_value?: number | null
          expires_at?: string
          id?: string
          message: string
          severity?: string
          source: string
          threshold?: number | null
        }
        Update: {
          acknowledged?: boolean
          alert_type?: string
          created_at?: string
          current_value?: number | null
          expires_at?: string
          id?: string
          message?: string
          severity?: string
          source?: string
          threshold?: number | null
        }
        Relationships: []
      }
      execution_analytics: {
        Row: {
          agent_id: string | null
          created_at: string
          currency_pair: string
          direction: string
          fill_latency_ms: number
          fill_price: number | null
          id: string
          is_news_window: boolean
          oanda_order_id: string | null
          provider_latency_ms: number | null
          regime_label: string | null
          requested_price: number | null
          session_label: string | null
          slippage_pips: number
          spread_at_entry: number | null
          tick_density: number | null
          toxicity_score: number | null
          vix_at_entry: number | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          currency_pair: string
          direction: string
          fill_latency_ms?: number
          fill_price?: number | null
          id?: string
          is_news_window?: boolean
          oanda_order_id?: string | null
          provider_latency_ms?: number | null
          regime_label?: string | null
          requested_price?: number | null
          session_label?: string | null
          slippage_pips?: number
          spread_at_entry?: number | null
          tick_density?: number | null
          toxicity_score?: number | null
          vix_at_entry?: number | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          currency_pair?: string
          direction?: string
          fill_latency_ms?: number
          fill_price?: number | null
          id?: string
          is_news_window?: boolean
          oanda_order_id?: string | null
          provider_latency_ms?: number | null
          regime_label?: string | null
          requested_price?: number | null
          session_label?: string | null
          slippage_pips?: number
          spread_at_entry?: number | null
          tick_density?: number | null
          toxicity_score?: number | null
          vix_at_entry?: number | null
        }
        Relationships: []
      }
      gate_bypasses: {
        Row: {
          bypassed_at: string
          created_at: string
          created_by: string
          expires_at: string
          gate_id: string
          id: string
          pair: string | null
          reason: string
          revoked: boolean
        }
        Insert: {
          bypassed_at?: string
          created_at?: string
          created_by?: string
          expires_at: string
          gate_id: string
          id?: string
          pair?: string | null
          reason?: string
          revoked?: boolean
        }
        Update: {
          bypassed_at?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          gate_id?: string
          id?: string
          pair?: string | null
          reason?: string
          revoked?: boolean
        }
        Relationships: []
      }
      market_liquidity_map: {
        Row: {
          bucket_width: string | null
          created_at: string
          currency_pair: string
          current_price: number | null
          id: string
          long_clusters: Json
          short_clusters: Json
          top_stop_clusters: Json
          updated_at: string
          wall_of_pain_pct: number | null
          wall_of_pain_price: number | null
          wall_of_pain_type: string | null
        }
        Insert: {
          bucket_width?: string | null
          created_at?: string
          currency_pair: string
          current_price?: number | null
          id?: string
          long_clusters?: Json
          short_clusters?: Json
          top_stop_clusters?: Json
          updated_at?: string
          wall_of_pain_pct?: number | null
          wall_of_pain_price?: number | null
          wall_of_pain_type?: string | null
        }
        Update: {
          bucket_width?: string | null
          created_at?: string
          currency_pair?: string
          current_price?: number | null
          id?: string
          long_clusters?: Json
          short_clusters?: Json
          top_stop_clusters?: Json
          updated_at?: string
          wall_of_pain_pct?: number | null
          wall_of_pain_price?: number | null
          wall_of_pain_type?: string | null
        }
        Relationships: []
      }
      oanda_orders: {
        Row: {
          agent_id: string | null
          bars_since_entry: number | null
          baseline_excluded: boolean
          closed_at: string | null
          confidence_score: number | null
          confirmation_tf_used: string | null
          counterfactual_entry_price: number | null
          counterfactual_exit_10m: number | null
          counterfactual_exit_15m: number | null
          counterfactual_exit_5m: number | null
          counterfactual_pips: number | null
          counterfactual_result: string | null
          created_at: string
          currency_pair: string
          direction: string
          direction_engine: string
          direction_tf_used: string | null
          entry_price: number | null
          entry_tf: string | null
          entry_ths: number | null
          environment: string
          error_message: string | null
          execution_quality_score: number | null
          exit_price: number | null
          exit_ths: number | null
          fill_latency_ms: number | null
          friction_score: number | null
          gate_reasons: string[] | null
          gate_result: string | null
          governance_composite: number | null
          governance_payload: Json | null
          health_band: string | null
          health_governance_action: string | null
          id: string
          idempotency_key: string | null
          mae_price: number | null
          mae_r: number | null
          mfe_price: number | null
          mfe_r: number | null
          oanda_order_id: string | null
          oanda_trade_id: string | null
          peak_ths: number | null
          progress_fail: boolean | null
          quantlabs_bias: string | null
          quantlabs_confidence: number | null
          r_pips: number | null
          regime_label: string | null
          requested_price: number | null
          session_label: string | null
          signal_id: string
          slippage_pips: number | null
          sovereign_override_status: string | null
          sovereign_override_tag: string | null
          spread_at_entry: number | null
          status: string
          time_to_mfe_bars: number | null
          trade_health_score: number | null
          ue_r: number | null
          units: number
          updated_at: string
          user_id: string
          variant_id: string
        }
        Insert: {
          agent_id?: string | null
          bars_since_entry?: number | null
          baseline_excluded?: boolean
          closed_at?: string | null
          confidence_score?: number | null
          confirmation_tf_used?: string | null
          counterfactual_entry_price?: number | null
          counterfactual_exit_10m?: number | null
          counterfactual_exit_15m?: number | null
          counterfactual_exit_5m?: number | null
          counterfactual_pips?: number | null
          counterfactual_result?: string | null
          created_at?: string
          currency_pair: string
          direction: string
          direction_engine?: string
          direction_tf_used?: string | null
          entry_price?: number | null
          entry_tf?: string | null
          entry_ths?: number | null
          environment?: string
          error_message?: string | null
          execution_quality_score?: number | null
          exit_price?: number | null
          exit_ths?: number | null
          fill_latency_ms?: number | null
          friction_score?: number | null
          gate_reasons?: string[] | null
          gate_result?: string | null
          governance_composite?: number | null
          governance_payload?: Json | null
          health_band?: string | null
          health_governance_action?: string | null
          id?: string
          idempotency_key?: string | null
          mae_price?: number | null
          mae_r?: number | null
          mfe_price?: number | null
          mfe_r?: number | null
          oanda_order_id?: string | null
          oanda_trade_id?: string | null
          peak_ths?: number | null
          progress_fail?: boolean | null
          quantlabs_bias?: string | null
          quantlabs_confidence?: number | null
          r_pips?: number | null
          regime_label?: string | null
          requested_price?: number | null
          session_label?: string | null
          signal_id: string
          slippage_pips?: number | null
          sovereign_override_status?: string | null
          sovereign_override_tag?: string | null
          spread_at_entry?: number | null
          status?: string
          time_to_mfe_bars?: number | null
          trade_health_score?: number | null
          ue_r?: number | null
          units: number
          updated_at?: string
          user_id: string
          variant_id?: string
        }
        Update: {
          agent_id?: string | null
          bars_since_entry?: number | null
          baseline_excluded?: boolean
          closed_at?: string | null
          confidence_score?: number | null
          confirmation_tf_used?: string | null
          counterfactual_entry_price?: number | null
          counterfactual_exit_10m?: number | null
          counterfactual_exit_15m?: number | null
          counterfactual_exit_5m?: number | null
          counterfactual_pips?: number | null
          counterfactual_result?: string | null
          created_at?: string
          currency_pair?: string
          direction?: string
          direction_engine?: string
          direction_tf_used?: string | null
          entry_price?: number | null
          entry_tf?: string | null
          entry_ths?: number | null
          environment?: string
          error_message?: string | null
          execution_quality_score?: number | null
          exit_price?: number | null
          exit_ths?: number | null
          fill_latency_ms?: number | null
          friction_score?: number | null
          gate_reasons?: string[] | null
          gate_result?: string | null
          governance_composite?: number | null
          governance_payload?: Json | null
          health_band?: string | null
          health_governance_action?: string | null
          id?: string
          idempotency_key?: string | null
          mae_price?: number | null
          mae_r?: number | null
          mfe_price?: number | null
          mfe_r?: number | null
          oanda_order_id?: string | null
          oanda_trade_id?: string | null
          peak_ths?: number | null
          progress_fail?: boolean | null
          quantlabs_bias?: string | null
          quantlabs_confidence?: number | null
          r_pips?: number | null
          regime_label?: string | null
          requested_price?: number | null
          session_label?: string | null
          signal_id?: string
          slippage_pips?: number | null
          sovereign_override_status?: string | null
          sovereign_override_tag?: string | null
          spread_at_entry?: number | null
          status?: string
          time_to_mfe_bars?: number | null
          trade_health_score?: number | null
          ue_r?: number | null
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
      shadow_trade_ledger: {
        Row: {
          agent_id: string
          closed_at: string | null
          created_at: string
          currency_pair: string
          direction: string
          dna_template: string | null
          entry_price: number
          entry_reason: string | null
          entry_spread: number | null
          exit_price: number | null
          exit_reason: string | null
          friction_score: number | null
          id: string
          mae_pips: number | null
          mfe_pips: number | null
          opened_at: string
          r_pips: number | null
          regime_label: string | null
          session_label: string | null
          signal_id: string
          status: string
          units: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          closed_at?: string | null
          created_at?: string
          currency_pair: string
          direction: string
          dna_template?: string | null
          entry_price: number
          entry_reason?: string | null
          entry_spread?: number | null
          exit_price?: number | null
          exit_reason?: string | null
          friction_score?: number | null
          id?: string
          mae_pips?: number | null
          mfe_pips?: number | null
          opened_at?: string
          r_pips?: number | null
          regime_label?: string | null
          session_label?: string | null
          signal_id: string
          status?: string
          units?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          closed_at?: string | null
          created_at?: string
          currency_pair?: string
          direction?: string
          dna_template?: string | null
          entry_price?: number
          entry_reason?: string | null
          entry_spread?: number | null
          exit_price?: number | null
          exit_reason?: string | null
          friction_score?: number | null
          id?: string
          mae_pips?: number | null
          mfe_pips?: number | null
          opened_at?: string
          r_pips?: number | null
          regime_label?: string | null
          session_label?: string | null
          signal_id?: string
          status?: string
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      sovereign_memory: {
        Row: {
          change_velocity: number | null
          created_at: string
          created_by: string
          decision_latency_ms: number | null
          expires_at: string | null
          id: string
          memory_key: string
          memory_type: string
          payload: Json
          previous_payload: Json | null
          relevance_score: number | null
          updated_at: string
          version: number
        }
        Insert: {
          change_velocity?: number | null
          created_at?: string
          created_by?: string
          decision_latency_ms?: number | null
          expires_at?: string | null
          id?: string
          memory_key: string
          memory_type: string
          payload?: Json
          previous_payload?: Json | null
          relevance_score?: number | null
          updated_at?: string
          version?: number
        }
        Update: {
          change_velocity?: number | null
          created_at?: string
          created_by?: string
          decision_latency_ms?: number | null
          expires_at?: string | null
          id?: string
          memory_key?: string
          memory_type?: string
          payload?: Json
          previous_payload?: Json | null
          relevance_score?: number | null
          updated_at?: string
          version?: number
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
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
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
      exec_sql: { Args: { sql_text: string }; Returns: Json }
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
