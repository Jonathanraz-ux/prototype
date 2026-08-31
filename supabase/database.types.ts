// ============================================================
// database.types.ts
// Types générés pour le schéma Supabase de WiFi Zone.
// Source de vérité : supabase/migrations/*.sql
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          status: "active" | "suspended" | "onboarding";
          logo_url: string | null;
          support_phone: string | null;
          support_email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          status?: "active" | "suspended" | "onboarding";
          logo_url?: string | null;
          support_phone?: string | null;
          support_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          status?: "active" | "suspended" | "onboarding";
          logo_url?: string | null;
          support_phone?: string | null;
          support_email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          full_name: string;
          first_name: string;
          last_name: string;
          phone: string | null;
          email: string | null;
          role: "user" | "site_manager" | "organization_admin" | "super_admin";
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          organization_id?: string | null;
          full_name: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          email?: string | null;
          role?: "user" | "site_manager" | "organization_admin" | "super_admin";
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          full_name?: string;
          first_name?: string;
          last_name?: string;
          phone?: string | null;
          email?: string | null;
          role?: "user" | "site_manager" | "organization_admin" | "super_admin";
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      licenses: {
        Row: {
          id: string;
          organization_id: string;
          license_key_hash: string;
          status: "pilot" | "active" | "suspended" | "expired" | "revoked";
          plan: string;
          valid_from: string;
          valid_until: string | null;
          grace_period_hours: number;
          max_sites: number;
          max_routers: number;
          max_admins: number;
          features: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          license_key_hash: string;
          status?: "pilot" | "active" | "suspended" | "expired" | "revoked";
          plan?: string;
          valid_from?: string;
          valid_until?: string | null;
          grace_period_hours?: number;
          max_sites?: number;
          max_routers?: number;
          max_admins?: number;
          features?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          license_key_hash?: string;
          status?: "pilot" | "active" | "suspended" | "expired" | "revoked";
          plan?: string;
          valid_from?: string;
          valid_until?: string | null;
          grace_period_hours?: number;
          max_sites?: number;
          max_routers?: number;
          max_admins?: number;
          features?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      sites: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          address: string | null;
          timezone: string;
          status: "active" | "inactive" | "maintenance";
          configuration: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          address?: string | null;
          timezone?: string;
          status?: "active" | "inactive" | "maintenance";
          configuration?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          address?: string | null;
          timezone?: string;
          status?: "active" | "inactive" | "maintenance";
          configuration?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      routers: {
        Row: {
          id: string;
          organization_id: string;
          site_id: string | null;
          name: string;
          vendor: string | null;
          model: string | null;
          router_identifier: string | null;
          adapter_type: "radius" | "mikrotik" | "development";
          status: "active" | "inactive" | "offline" | "maintenance";
          last_seen_at: string | null;
          configuration_reference: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          site_id?: string | null;
          name: string;
          vendor?: string | null;
          model?: string | null;
          router_identifier?: string | null;
          adapter_type?: "radius" | "mikrotik" | "development";
          status?: "active" | "inactive" | "offline" | "maintenance";
          last_seen_at?: string | null;
          configuration_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          site_id?: string | null;
          name?: string;
          vendor?: string | null;
          model?: string | null;
          router_identifier?: string | null;
          adapter_type?: "radius" | "mikrotik" | "development";
          status?: "active" | "inactive" | "offline" | "maintenance";
          last_seen_at?: string | null;
          configuration_reference?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      devices: {
        Row: {
          id: string;
          organization_id: string | null;
          user_id: string | null;
          installation_id: string;
          device_hash: string | null;
          platform: string | null;
          app_version: string | null;
          status: "active" | "blocked" | "inactive";
          last_seen_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          installation_id: string;
          device_hash?: string | null;
          platform?: string | null;
          app_version?: string | null;
          status?: "active" | "blocked" | "inactive";
          last_seen_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          installation_id?: string;
          device_hash?: string | null;
          platform?: string | null;
          app_version?: string | null;
          status?: "active" | "blocked" | "inactive";
          last_seen_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      ad_campaigns: {
        Row: {
          id: string;
          organization_id: string;
          site_id: string | null;
          title: string;
          advertiser_name: string;
          media_url: string;
          thumbnail_url: string | null;
          duration_seconds: number;
          reward_type: "minutes" | "megabytes" | "mixed";
          reward_value: number;
          daily_view_limit: number | null;
          starts_at: string | null;
          ends_at: string | null;
          status: "draft" | "active" | "paused" | "ended";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          site_id?: string | null;
          title: string;
          advertiser_name: string;
          media_url: string;
          thumbnail_url?: string | null;
          duration_seconds?: number;
          reward_type?: "minutes" | "megabytes" | "mixed";
          reward_value?: number;
          daily_view_limit?: number | null;
          starts_at?: string | null;
          ends_at?: string | null;
          status?: "draft" | "active" | "paused" | "ended";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          site_id?: string | null;
          title?: string;
          advertiser_name?: string;
          media_url?: string;
          thumbnail_url?: string | null;
          duration_seconds?: number;
          reward_type?: "minutes" | "megabytes" | "mixed";
          reward_value?: number;
          daily_view_limit?: number | null;
          starts_at?: string | null;
          ends_at?: string | null;
          status?: "draft" | "active" | "paused" | "ended";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      ad_views: {
        Row: {
          id: string;
          organization_id: string | null;
          site_id: string | null;
          campaign_id: string;
          user_id: string | null;
          device_id: string | null;
          started_at: string;
          completed_at: string | null;
          watched_seconds: number;
          completion_status: "completed" | "abandoned" | "invalidated";
          proof_nonce: string;
          reward_granted: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          site_id?: string | null;
          campaign_id: string;
          user_id?: string | null;
          device_id?: string | null;
          started_at?: string;
          completed_at?: string | null;
          watched_seconds?: number;
          completion_status?: "completed" | "abandoned" | "invalidated";
          proof_nonce: string;
          reward_granted?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          site_id?: string | null;
          campaign_id?: string;
          user_id?: string | null;
          device_id?: string | null;
          started_at?: string;
          completed_at?: string | null;
          watched_seconds?: number;
          completion_status?: "completed" | "abandoned" | "invalidated";
          proof_nonce?: string;
          reward_granted?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      wifi_sessions: {
        Row: {
          id: string;
          organization_id: string | null;
          site_id: string | null;
          router_id: string | null;
          user_id: string | null;
          device_id: string | null;
          ad_view_id: string | null;
          status:
            | "pending"
            | "authorized"
            | "active"
            | "expired"
            | "disconnected"
            | "failed";
          started_at: string;
          expires_at: string | null;
          ended_at: string | null;
          allocated_seconds: number;
          allocated_bytes: number;
          consumed_seconds: number | null;
          consumed_bytes: number | null;
          network_session_reference: string | null;
          disconnect_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          site_id?: string | null;
          router_id?: string | null;
          user_id?: string | null;
          device_id?: string | null;
          ad_view_id?: string | null;
          status?:
            | "pending"
            | "authorized"
            | "active"
            | "expired"
            | "disconnected"
            | "failed";
          started_at?: string;
          expires_at?: string | null;
          ended_at?: string | null;
          allocated_seconds?: number;
          allocated_bytes?: number;
          consumed_seconds?: number | null;
          consumed_bytes?: number | null;
          network_session_reference?: string | null;
          disconnect_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          site_id?: string | null;
          router_id?: string | null;
          user_id?: string | null;
          device_id?: string | null;
          ad_view_id?: string | null;
          status?:
            | "pending"
            | "authorized"
            | "active"
            | "expired"
            | "disconnected"
            | "failed";
          started_at?: string;
          expires_at?: string | null;
          ended_at?: string | null;
          allocated_seconds?: number;
          allocated_bytes?: number;
          consumed_seconds?: number | null;
          consumed_bytes?: number | null;
          network_session_reference?: string | null;
          disconnect_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      quota_transactions: {
        Row: {
          id: string;
          organization_id: string | null;
          user_id: string | null;
          device_id: string | null;
          session_id: string | null;
          ad_view_id: string | null;
          type: "grant" | "consume" | "refund" | "adjustment";
          seconds_delta: number;
          bytes_delta: number;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          device_id?: string | null;
          session_id?: string | null;
          ad_view_id?: string | null;
          type: "grant" | "consume" | "refund" | "adjustment";
          seconds_delta?: number;
          bytes_delta?: number;
          reason?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          user_id?: string | null;
          device_id?: string | null;
          session_id?: string | null;
          ad_view_id?: string | null;
          type?: "grant" | "consume" | "refund" | "adjustment";
          seconds_delta?: number;
          bytes_delta?: number;
          reason?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          organization_id: string | null;
          user_id: string;
          title: string;
          body: string;
          type: "promotion" | "maintenance" | "quota" | "system";
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          user_id: string;
          title: string;
          body: string;
          type?: "promotion" | "maintenance" | "quota" | "system";
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          user_id?: string;
          title?: string;
          body?: string;
          type?: "promotion" | "maintenance" | "quota" | "system";
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          device_id: string | null;
          active: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          device_id?: string | null;
          active?: boolean;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          expo_push_token?: string;
          device_id?: string | null;
          active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          organization_id: string | null;
          actor_id: string | null;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          metadata: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string | null;
          actor_id?: string | null;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string | null;
          actor_id?: string | null;
          action?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_updated_at: {
        Args: Record<string, never>;
        Returns: unknown;
      };
      get_user_quota: {
        Args: { p_user_id: string };
        Returns: unknown;
      };
      organization_admin_stats: {
        Args: { p_org_id: string };
        Returns: unknown;
      };
    };
    Enums: {
      app_role: "user" | "site_manager" | "organization_admin" | "super_admin";
      organization_status: "active" | "suspended" | "onboarding";
      license_status: "pilot" | "active" | "suspended" | "expired" | "revoked";
      site_status: "active" | "inactive" | "maintenance";
      router_status: "active" | "inactive" | "offline" | "maintenance";
      adapter_type: "radius" | "mikrotik" | "development";
      device_status: "active" | "blocked" | "inactive";
      ad_campaign_status: "draft" | "active" | "paused" | "ended";
      reward_type: "minutes" | "megabytes" | "mixed";
      ad_completion_status: "completed" | "abandoned" | "invalidated";
      wifi_session_status:
        | "pending"
        | "authorized"
        | "active"
        | "expired"
        | "disconnected"
        | "failed";
      quota_transaction_type: "grant" | "consume" | "refund" | "adjustment";
      notification_type: "promotion" | "maintenance" | "quota" | "system";
    };
    CompositeTypes: Record<string, never>;
  };
}
