export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          clerk_id: string
          email: string
          stripe_customer_id: string | null
          discord_id: string | null
          platform_tier: 'free' | 'starter' | 'pro' | 'whale'
          api_tier: 'free' | 'basic' | 'pro' | 'institutional'
          bot_tier: 'free' | 'basic' | 'pro' | 'server'
          platform_sub_id: string | null
          api_sub_id: string | null
          bot_sub_id: string | null
          is_founding_member: boolean
          trial_ends_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['users']['Row']>
        Update: Partial<Database['public']['Tables']['users']['Row']>
      }
      flow_cache: {
        Row: {
          id: number
          polygon_id: string
          ticker: string
          strike: number
          expiry: string
          dte: number
          flow_type: 'CALL' | 'PUT'
          order_type: 'SWEEP' | 'BLOCK' | 'SPLIT'
          sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
          premium: number
          total_premium: number
          price: number
          size: number
          open_interest: number | null
          iv: number | null
          is_sweep: boolean
          is_unusual: boolean
          traded_at: string
          ingested_at: string
        }
        Insert: Partial<Database['public']['Tables']['flow_cache']['Row']>
        Update: Partial<Database['public']['Tables']['flow_cache']['Row']>
      }
      alerts: {
        Row: {
          id: string
          user_id: string
          ticker: string | null
          flow_type: 'CALL' | 'PUT' | null
          order_type: 'SWEEP' | 'BLOCK' | 'SPLIT' | null
          sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | null
          min_premium: number | null
          min_size: number | null
          max_dte: number | null
          unusual_only: boolean
          notify_discord: boolean
          notify_web: boolean
          is_active: boolean
          fired_today: number
          total_fired: number
          created_at: string
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['alerts']['Row']>
        Update: Partial<Database['public']['Tables']['alerts']['Row']>
      }
      alert_log: {
        Row: {
          id: number
          alert_id: string
          user_id: string
          flow_cache_id: number | null
          ticker: string
          flow_type: 'CALL' | 'PUT'
          total_premium: number
          order_type: 'SWEEP' | 'BLOCK' | 'SPLIT'
          fired_at: string
        }
        Insert: Partial<Database['public']['Tables']['alert_log']['Row']>
        Update: Partial<Database['public']['Tables']['alert_log']['Row']>
      }
      api_usage: {
        Row: {
          id: number
          user_id: string
          week_start: string
          credits_used: number
          credits_alloc: number
          endpoint_counts: Json
          updated_at: string
        }
        Insert: Partial<Database['public']['Tables']['api_usage']['Row']>
        Update: Partial<Database['public']['Tables']['api_usage']['Row']>
      }
      stripe_events: {
        Row: {
          stripe_event_id: string
          event_type: string
          processed_at: string
          payload: Json | null
        }
        Insert: Partial<Database['public']['Tables']['stripe_events']['Row']>
        Update: Partial<Database['public']['Tables']['stripe_events']['Row']>
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
