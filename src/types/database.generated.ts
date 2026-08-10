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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      achievement_definitions: {
        Row: {
          code: string
          color_key: string
          created_at: string
          description: string | null
          icon: string
          is_active: boolean
          sort_order: number
          title: string
          unlocked_description: string | null
          unlocked_title: string
          updated_at: string
        }
        Insert: {
          code: string
          color_key?: string
          created_at?: string
          description?: string | null
          icon?: string
          is_active?: boolean
          sort_order?: number
          title: string
          unlocked_description?: string | null
          unlocked_title: string
          updated_at?: string
        }
        Update: {
          code?: string
          color_key?: string
          created_at?: string
          description?: string | null
          icon?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          unlocked_description?: string | null
          unlocked_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_user_id: string | null
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          admin_user_id?: string | null
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          announcement_date: string | null
          archived_at: string | null
          audience: Database["public"]["Enums"]["audience_type"]
          color_key: string | null
          content: string
          created_at: string
          created_by: string | null
          event_id: string | null
          id: string
          is_pinned: boolean
          is_published: boolean
          priority: string | null
          title: string
          updated_at: string
        }
        Insert: {
          announcement_date?: string | null
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["audience_type"]
          color_key?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          priority?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          announcement_date?: string | null
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["audience_type"]
          color_key?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          id?: string
          is_pinned?: boolean
          is_published?: boolean
          priority?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_qr_codes: {
        Row: {
          created_at: string
          is_active: boolean
          program_code: string
          rotated_at: string | null
          token: string
          updated_at: string
          updated_by: string | null
          version: number
          window_after_minutes: number
          window_before_minutes: number
        }
        Insert: {
          created_at?: string
          is_active?: boolean
          program_code: string
          rotated_at?: string | null
          token?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          window_after_minutes?: number
          window_before_minutes?: number
        }
        Update: {
          created_at?: string
          is_active?: boolean
          program_code?: string
          rotated_at?: string | null
          token?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          window_after_minutes?: number
          window_before_minutes?: number
        }
        Relationships: []
      }
      dog_documents: {
        Row: {
          created_at: string
          document_type: string
          dog_id: string
          expires_on: string | null
          id: string
          issued_on: string | null
          notes: string | null
          original_filename: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          dog_id: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          original_filename?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          dog_id?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          notes?: string | null
          original_filename?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dog_documents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
        ]
      }
      dogs: {
        Row: {
          allergies: string | null
          behavior_notes: string | null
          birth_date: string | null
          breed: string | null
          created_at: string
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          feeding_notes: string | null
          id: string
          is_active: boolean
          medications: string | null
          name: string
          notes: string | null
          photo_path: string | null
          sex: string | null
          updated_at: string
          user_id: string
          veterinarian_name: string | null
          veterinarian_phone: string | null
          weight_kg: number | null
        }
        Insert: {
          allergies?: string | null
          behavior_notes?: string | null
          birth_date?: string | null
          breed?: string | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          feeding_notes?: string | null
          id?: string
          is_active?: boolean
          medications?: string | null
          name: string
          notes?: string | null
          photo_path?: string | null
          sex?: string | null
          updated_at?: string
          user_id: string
          veterinarian_name?: string | null
          veterinarian_phone?: string | null
          weight_kg?: number | null
        }
        Update: {
          allergies?: string | null
          behavior_notes?: string | null
          birth_date?: string | null
          breed?: string | null
          created_at?: string
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          feeding_notes?: string | null
          id?: string
          is_active?: boolean
          medications?: string | null
          name?: string
          notes?: string | null
          photo_path?: string | null
          sex?: string | null
          updated_at?: string
          user_id?: string
          veterinarian_name?: string | null
          veterinarian_phone?: string | null
          weight_kg?: number | null
        }
        Relationships: []
      }
      events: {
        Row: {
          archived_at: string | null
          audience: Database["public"]["Enums"]["audience_type"]
          color_key: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          has_time: boolean
          id: string
          is_published: boolean
          location: string | null
          priority: string | null
          recurrence_key: string | null
          recurrence_label: string | null
          repeat_interval_days: number | null
          repeat_limit: number
          repeat_type: string
          start_date: string
          title: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["audience_type"]
          color_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          has_time?: boolean
          id?: string
          is_published?: boolean
          location?: string | null
          priority?: string | null
          recurrence_key?: string | null
          recurrence_label?: string | null
          repeat_interval_days?: number | null
          repeat_limit?: number
          repeat_type?: string
          start_date: string
          title: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audience?: Database["public"]["Enums"]["audience_type"]
          color_key?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          has_time?: boolean
          id?: string
          is_published?: boolean
          location?: string | null
          priority?: string | null
          recurrence_key?: string | null
          recurrence_label?: string | null
          repeat_interval_days?: number | null
          repeat_limit?: number
          repeat_type?: string
          start_date?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          code: string
          description: string | null
          enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          description?: string | null
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          description?: string | null
          enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      membership_billing_profiles: {
        Row: {
          amount: number
          created_at: string
          due_day: number
          ends_on: string | null
          is_active: boolean
          membership_id: string
          notes: string | null
          starts_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          due_day: number
          ends_on?: string | null
          is_active?: boolean
          membership_id: string
          notes?: string | null
          starts_on: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_day?: number
          ends_on?: string | null
          is_active?: boolean
          membership_id?: string
          notes?: string | null
          starts_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_billing_profiles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_delete_requests: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          reason: string | null
          requested_at: string
          requested_by: string | null
          resolved_at: string | null
          resolved_by: string | null
          snapshot_email: string | null
          snapshot_member_number: string | null
          snapshot_name: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot_email?: string | null
          snapshot_member_number?: string | null
          snapshot_name?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          snapshot_email?: string | null
          snapshot_member_number?: string | null
          snapshot_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          approved_by: string | null
          created_at: string
          current_payment_status: string
          end_date: string | null
          id: string
          last_payment_at: string | null
          member_number: string | null
          payment_notes: string | null
          qr_token: string
          start_date: string | null
          status: Database["public"]["Enums"]["membership_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          current_payment_status?: string
          end_date?: string | null
          id?: string
          last_payment_at?: string | null
          member_number?: string | null
          payment_notes?: string | null
          qr_token?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          current_payment_status?: string
          end_date?: string | null
          id?: string
          last_payment_at?: string | null
          member_number?: string | null
          payment_notes?: string | null
          qr_token?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["membership_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_campaigns: {
        Row: {
          archived_at: string | null
          audience: string
          body: string
          category: string
          created_at: string
          created_by: string | null
          failure_count: number
          id: string
          metadata: Json
          sent_at: string | null
          status: string
          success_count: number
          title: string
          total_targets: number
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          audience?: string
          body: string
          category?: string
          created_at?: string
          created_by?: string | null
          failure_count?: number
          id?: string
          metadata?: Json
          sent_at?: string | null
          status?: string
          success_count?: number
          title: string
          total_targets?: number
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          audience?: string
          body?: string
          category?: string
          created_at?: string
          created_by?: string | null
          failure_count?: number
          id?: string
          metadata?: Json
          sent_at?: string | null
          status?: string
          success_count?: number
          title?: string
          total_targets?: number
          updated_at?: string
        }
        Relationships: []
      }
      notification_class_cancellation_locks: {
        Row: {
          campaign_id: string | null
          cancellation_date: string
          created_at: string
          enrollment_id: string
          id: string
          program_id: string
          schedule_id: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          cancellation_date: string
          created_at?: string
          enrollment_id: string
          id?: string
          program_id: string
          schedule_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          cancellation_date?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          program_id?: string
          schedule_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_class_cancellation_locks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_class_cancellation_locks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_class_cancellation_locks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_class_cancellation_locks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "program_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_class_reminder_locks: {
        Row: {
          campaign_id: string | null
          class_date: string
          created_at: string
          enrollment_id: string
          id: string
          program_id: string
          reminder_type: string
          schedule_id: string
          sent_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          class_date: string
          created_at?: string
          enrollment_id: string
          id?: string
          program_id: string
          reminder_type?: string
          schedule_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          class_date?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          program_id?: string
          reminder_type?: string
          schedule_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_class_reminder_locks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_class_reminder_locks_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_class_reminder_locks_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_class_reminder_locks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "program_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          campaign_id: string
          created_at: string
          error_message: string | null
          expo_push_token: string
          expo_response: Json
          id: string
          sent_at: string | null
          status: string
          token_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error_message?: string | null
          expo_push_token: string
          expo_response?: Json
          id?: string
          sent_at?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error_message?: string | null
          expo_push_token?: string
          expo_response?: Json
          id?: string
          sent_at?: string | null
          status?: string
          token_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "notification_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "notification_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          achievements: boolean
          announcements_events: boolean
          classes: boolean
          created_at: string
          enabled: boolean
          membership: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          achievements?: boolean
          announcements_events?: boolean
          classes?: boolean
          created_at?: string
          enabled?: boolean
          membership?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          achievements?: boolean
          announcements_events?: boolean
          classes?: boolean
          created_at?: string
          enabled?: boolean
          membership?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_tokens: {
        Row: {
          app_ownership: string | null
          app_version: string | null
          created_at: string
          device_id: string | null
          device_name: string | null
          disabled_at: string | null
          expo_push_token: string
          id: string
          is_active: boolean
          last_registered_at: string
          platform: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          app_ownership?: string | null
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          device_name?: string | null
          disabled_at?: string | null
          expo_push_token: string
          id?: string
          is_active?: boolean
          last_registered_at?: string
          platform?: string
          project_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          app_ownership?: string | null
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          device_name?: string | null
          disabled_at?: string | null
          expo_push_token?: string
          id?: string
          is_active?: boolean
          last_registered_at?: string
          platform?: string
          project_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_obligations: {
        Row: {
          amount: number
          cancelled_at: string | null
          cancelled_by: string | null
          concept: string
          created_at: string
          created_by: string | null
          currency: string
          due_date: string
          id: string
          membership_id: string | null
          notes: string | null
          obligation_type: string
          period_end: string | null
          period_start: string | null
          source: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          concept: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date: string
          id?: string
          membership_id?: string | null
          notes?: string | null
          obligation_type?: string
          period_end?: string | null
          period_start?: string | null
          source?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          cancelled_by?: string | null
          concept?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string
          id?: string
          membership_id?: string | null
          notes?: string | null
          obligation_type?: string
          period_end?: string | null
          period_start?: string | null
          source?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_obligations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settings: {
        Row: {
          account_holder: string | null
          bank_name: string | null
          clabe: string | null
          clip_url: string | null
          id: number
          is_active: boolean
          transfer_instructions: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_holder?: string | null
          bank_name?: string | null
          clabe?: string | null
          clip_url?: string | null
          id?: number
          is_active?: boolean
          transfer_instructions?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_holder?: string | null
          bank_name?: string | null
          clabe?: string | null
          clip_url?: string | null
          id?: number
          is_active?: boolean
          transfer_instructions?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          concept: string
          created_at: string
          id: string
          membership_id: string | null
          notes: string | null
          obligation_id: string | null
          paid_at: string | null
          payment_method: string | null
          period_label: string | null
          registered_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          concept: string
          created_at?: string
          id?: string
          membership_id?: string | null
          notes?: string | null
          obligation_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_label?: string | null
          registered_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          concept?: string
          created_at?: string
          id?: string
          membership_id?: string | null
          notes?: string | null
          obligation_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_label?: string | null
          registered_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "payment_obligations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_color: string
          created_at: string
          deletion_request_reason: string | null
          deletion_requested_at: string | null
          dog_name: string | null
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_color?: string
          created_at?: string
          deletion_request_reason?: string | null
          deletion_requested_at?: string | null
          dog_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_color?: string
          created_at?: string
          deletion_request_reason?: string | null
          deletion_requested_at?: string | null
          dog_name?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      program_attendances: {
        Row: {
          attendance_date: string
          created_at: string
          enrollment_id: string
          id: string
          marked_by: string | null
          notes: string | null
          recorded_at: string
          session_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          created_at?: string
          enrollment_id: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          recorded_at?: string
          session_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          created_at?: string
          enrollment_id?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          recorded_at?: string
          session_id?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_attendances_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_attendances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      program_class_cancellations: {
        Row: {
          announcement_id: string | null
          cancellation_date: string
          created_at: string
          created_by: string | null
          id: string
          reason: string | null
          restored_at: string | null
          restored_by: string | null
          schedule_id: string
          updated_at: string
        }
        Insert: {
          announcement_id?: string | null
          cancellation_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          schedule_id: string
          updated_at?: string
        }
        Update: {
          announcement_id?: string | null
          cancellation_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          reason?: string | null
          restored_at?: string | null
          restored_by?: string | null
          schedule_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_class_cancellations_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_class_cancellations_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "program_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      program_enrollments: {
        Row: {
          attendances_count: number
          cancelled_at: string | null
          card_expires_on: string | null
          card_started_on: string | null
          completed_at: string | null
          created_at: string
          dog_id: string | null
          dog_name: string | null
          id: string
          last_attendance_at: string | null
          notes: string | null
          physical_card_number: string | null
          program_id: string
          program_level: string
          qr_token: string
          requirements_met_at: string | null
          schedule_id: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attendances_count?: number
          cancelled_at?: string | null
          card_expires_on?: string | null
          card_started_on?: string | null
          completed_at?: string | null
          created_at?: string
          dog_id?: string | null
          dog_name?: string | null
          id?: string
          last_attendance_at?: string | null
          notes?: string | null
          physical_card_number?: string | null
          program_id: string
          program_level?: string
          qr_token: string
          requirements_met_at?: string | null
          schedule_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attendances_count?: number
          cancelled_at?: string | null
          card_expires_on?: string | null
          card_started_on?: string | null
          completed_at?: string | null
          created_at?: string
          dog_id?: string | null
          dog_name?: string | null
          id?: string
          last_attendance_at?: string | null
          notes?: string | null
          physical_card_number?: string | null
          program_id?: string
          program_level?: string
          qr_token?: string
          requirements_met_at?: string | null
          schedule_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_enrollments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_enrollments_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "program_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      program_exams: {
        Row: {
          completed_at: string | null
          created_at: string
          enrollment_id: string
          id: string
          promotion_applied_at: string | null
          requested_at: string
          requested_by: string | null
          result_notes: string | null
          reviewed_by: string | null
          scheduled_at: string | null
          status: string
          target_level: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          promotion_applied_at?: string | null
          requested_at?: string
          requested_by?: string | null
          result_notes?: string | null
          reviewed_by?: string | null
          scheduled_at?: string | null
          status?: string
          target_level?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          promotion_applied_at?: string | null
          requested_at?: string
          requested_by?: string | null
          result_notes?: string | null
          reviewed_by?: string | null
          scheduled_at?: string | null
          status?: string
          target_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_exams_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      program_schedule_versions: {
        Row: {
          change_note: string | null
          created_at: string
          created_by: string | null
          cycle_start_date: string | null
          day_of_week: number
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          name: string
          repeat_type: string
          retired_at: string | null
          retired_by: string | null
          schedule_id: string
          sequence_order: number
          start_time: string
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          cycle_start_date?: string | null
          day_of_week: number
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name: string
          repeat_type: string
          retired_at?: string | null
          retired_by?: string | null
          schedule_id: string
          sequence_order?: number
          start_time: string
        }
        Update: {
          change_note?: string | null
          created_at?: string
          created_by?: string | null
          cycle_start_date?: string | null
          day_of_week?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          name?: string
          repeat_type?: string
          retired_at?: string | null
          retired_by?: string | null
          schedule_id?: string
          sequence_order?: number
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_schedule_versions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "program_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      program_schedules: {
        Row: {
          created_at: string
          cycle_start_date: string | null
          day_of_week: number
          id: string
          is_active: boolean
          name: string
          program_id: string
          repeat_type: string
          sequence_order: number
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_start_date?: string | null
          day_of_week: number
          id?: string
          is_active?: boolean
          name: string
          program_id: string
          repeat_type?: string
          sequence_order?: number
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_start_date?: string | null
          day_of_week?: number
          id?: string
          is_active?: boolean
          name?: string
          program_id?: string
          repeat_type?: string
          sequence_order?: number
          start_time?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_schedules_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sessions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          schedule_id: string
          scheduled_start_time: string
          session_date: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          schedule_id: string
          scheduled_start_time: string
          session_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          schedule_id?: string
          scheduled_start_time?: string
          session_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_sessions_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "program_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          code: string
          color_key: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          required_attendances: number
          updated_at: string
        }
        Insert: {
          code: string
          color_key?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          required_attendances?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color_key?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          required_attendances?: number
          updated_at?: string
        }
        Relationships: []
      }
      user_achievements: {
        Row: {
          achievement_code: string
          awarded_at: string
          awarded_by: string | null
          created_at: string
          id: string
          source_id: string | null
          source_type: string | null
          user_id: string
        }
        Insert: {
          achievement_code: string
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string
          id?: string
          source_id?: string | null
          source_type?: string | null
          user_id: string
        }
        Update: {
          achievement_code?: string
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string
          id?: string
          source_id?: string | null
          source_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_code_fkey"
            columns: ["achievement_code"]
            isOneToOne: false
            referencedRelation: "achievement_definitions"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_change_program_schedule_from_date: {
        Args: {
          p_change_note?: string
          p_cycle_start_date?: string
          p_day_of_week: number
          p_effective_from: string
          p_is_active?: boolean
          p_name: string
          p_repeat_type: string
          p_schedule_id: string
          p_sequence_order?: number
          p_start_time: string
        }
        Returns: string
      }
      correct_program_attendance_admin: {
        Args: {
          p_attendance_date: string
          p_attendance_id: string
          p_notes?: string
          p_schedule_id: string
        }
        Returns: string
      }
      create_my_basic_dog: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }[]
      }
      disable_notification_token: {
        Args: { p_expo_push_token: string }
        Returns: undefined
      }
      get_admin_attendance_day: {
        Args: { p_date: string }
        Returns: {
          attendance_date: string
          attendance_id: string
          client_email: string
          client_name: string
          dog_name: string
          member_number: string
          physical_card_number: string
          program_code: string
          program_level: string
          program_name: string
          recorded_at: string
          schedule_id: string
          schedule_name: string
          scheduled_start_time: string
          session_id: string
          source: string
          user_id: string
        }[]
      }
      get_effective_program_schedule: {
        Args: { p_date: string; p_schedule_id: string }
        Returns: {
          cycle_start_date: string
          day_of_week: number
          effective_from: string
          effective_to: string
          is_active: boolean
          name: string
          program_id: string
          repeat_type: string
          schedule_id: string
          sequence_order: number
          start_time: string
          version_id: string
        }[]
      }
      get_effective_program_schedules: {
        Args: { p_date: string }
        Returns: {
          cycle_start_date: string
          day_of_week: number
          effective_from: string
          effective_to: string
          id: string
          is_active: boolean
          name: string
          program_id: string
          repeat_type: string
          sequence_order: number
          start_time: string
          version_id: string
        }[]
      }
      get_my_basic_dogs: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }[]
      }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_active_membership: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_feature_enabled: { Args: { p_code: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_ucapsa_admin: { Args: never; Returns: boolean }
      program_schedule_occurs_on_date: {
        Args: { p_date: string; p_schedule_id: string }
        Returns: boolean
      }
      refresh_program_enrollment_progress: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      register_program_attendance_admin: {
        Args: {
          p_attendance_date: string
          p_enrollment_id: string
          p_notes?: string
          p_schedule_id?: string
        }
        Returns: string
      }
      register_program_attendance_from_qr: {
        Args: { p_enrollment_id: string; p_qr_token: string }
        Returns: {
          attendance_id: string
          message: string
          result: string
          session_id: string
        }[]
      }
      rename_my_basic_dog: {
        Args: { p_dog_id: string; p_name: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }[]
      }
      rotate_attendance_qr_code: {
        Args: { p_program_code: string }
        Returns: string
      }
      ucapsa_achievement_code_for_enrollment: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      upsert_notification_token: {
        Args: {
          p_app_ownership?: string
          p_app_version?: string
          p_device_id?: string
          p_device_name?: string
          p_expo_push_token: string
          p_platform?: string
          p_project_id?: string
        }
        Returns: {
          app_ownership: string | null
          app_version: string | null
          created_at: string
          device_id: string | null
          device_name: string | null
          disabled_at: string | null
          expo_push_token: string
          id: string
          is_active: boolean
          last_registered_at: string
          platform: string
          project_id: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "notification_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "client" | "member" | "admin" | "super_admin"
      audience_type: "public" | "clients" | "members" | "admins"
      membership_status:
        | "none"
        | "pending"
        | "active"
        | "expired"
        | "rejected"
        | "cancelled"
      payment_status: "pending" | "paid" | "cancelled"
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
      app_role: ["client", "member", "admin", "super_admin"],
      audience_type: ["public", "clients", "members", "admins"],
      membership_status: [
        "none",
        "pending",
        "active",
        "expired",
        "rejected",
        "cancelled",
      ],
      payment_status: ["pending", "paid", "cancelled"],
    },
  },
} as const
