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
      account_deletion_request_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          note: string | null
          notification_method: string | null
          notification_reference: string | null
          request_id: string
          retention_until: string | null
          to_status: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          note?: string | null
          notification_method?: string | null
          notification_reference?: string | null
          request_id: string
          retention_until?: string | null
          to_status?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          note?: string | null
          notification_method?: string | null
          notification_reference?: string | null
          request_id?: string
          retention_until?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_deletion_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "account_deletion_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      account_deletion_requests: {
        Row: {
          created_at: string
          id: string
          notification_method: string | null
          notification_reference: string | null
          notified_at: string | null
          reason: string | null
          requested_at: string
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          retention_until: string | null
          snapshot_email: string | null
          snapshot_name: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notification_method?: string | null
          notification_reference?: string | null
          notified_at?: string | null
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retention_until?: string | null
          snapshot_email?: string | null
          snapshot_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notification_method?: string | null
          notification_reference?: string | null
          notified_at?: string | null
          reason?: string | null
          requested_at?: string
          requested_by?: string | null
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retention_until?: string | null
          snapshot_email?: string | null
          snapshot_name?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
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
      dog_awards: {
        Row: {
          award_code: string
          awarded_at: string
          awarded_by: string | null
          created_at: string
          dog_id: string
          id: string
          note: string | null
          revoked_at: string | null
          revoked_by: string | null
          season_id: string | null
        }
        Insert: {
          award_code: string
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string
          dog_id: string
          id?: string
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          season_id?: string | null
        }
        Update: {
          award_code?: string
          awarded_at?: string
          awarded_by?: string | null
          created_at?: string
          dog_id?: string
          id?: string
          note?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          season_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dog_awards_award_code_fkey"
            columns: ["award_code"]
            isOneToOne: false
            referencedRelation: "ucapsa_award_definitions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
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
          {
            foreignKeyName: "dog_documents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_documents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_documents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_documents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_documents_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
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
      member_visit_dogs: {
        Row: {
          credit_source: string
          credited_at: string
          credited_by: string | null
          dog_id: string
          visit_id: string
        }
        Insert: {
          credit_source?: string
          credited_at?: string
          credited_by?: string | null
          dog_id: string
          visit_id: string
        }
        Update: {
          credit_source?: string
          credited_at?: string
          credited_by?: string | null
          dog_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_visit_dogs_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_visit_dogs_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "member_visit_dogs_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "member_visit_dogs_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "member_visit_dogs_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "member_visit_dogs_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "member_visit_dogs_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "member_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      member_visits: {
        Row: {
          client_event_id: string | null
          created_at: string
          id: string
          membership_id: string | null
          notes: string | null
          recorded_by: string | null
          source: string
          updated_at: string
          user_id: string
          visit_date: string
          visited_at: string
        }
        Insert: {
          client_event_id?: string | null
          created_at?: string
          id?: string
          membership_id?: string | null
          notes?: string | null
          recorded_by?: string | null
          source?: string
          updated_at?: string
          user_id: string
          visit_date?: string
          visited_at?: string
        }
        Update: {
          client_event_id?: string | null
          created_at?: string
          id?: string
          membership_id?: string | null
          notes?: string | null
          recorded_by?: string | null
          source?: string
          updated_at?: string
          user_id?: string
          visit_date?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_visits_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_visits_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["membership_id"]
          },
        ]
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
          {
            foreignKeyName: "membership_billing_profiles_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["membership_id"]
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
          {
            foreignKeyName: "payment_obligations_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["membership_id"]
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
            foreignKeyName: "payments_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["membership_id"]
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
      practice_sessions: {
        Row: {
          client_event_id: string | null
          completed_at: string
          created_at: string
          difficulty: string
          dog_id: string | null
          duration_seconds: number | null
          enrollment_id: string | null
          id: string
          note: string | null
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_event_id?: string | null
          completed_at?: string
          created_at?: string
          difficulty: string
          dog_id?: string | null
          duration_seconds?: number | null
          enrollment_id?: string | null
          id?: string
          note?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_event_id?: string | null
          completed_at?: string
          created_at?: string
          difficulty?: string
          dog_id?: string | null
          duration_seconds?: number | null
          enrollment_id?: string | null
          id?: string
          note?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_sessions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_sessions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "practice_sessions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "practice_sessions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "practice_sessions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "practice_sessions_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "practice_sessions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_notices: {
        Row: {
          arco_procedure: string | null
          change_notice_method: string | null
          consent_required_purposes: string | null
          contact_email: string | null
          created_at: string
          created_by: string | null
          data_categories: string | null
          effective_from: string | null
          id: string
          integral_notice: string | null
          limitation_mechanisms: string | null
          published_at: string | null
          published_by: string | null
          purposes: string | null
          responsible_address: string | null
          responsible_name: string | null
          sensitive_data_categories: string | null
          simplified_notice: string | null
          status: string
          transfer_clause: string | null
          updated_at: string
          version: string
        }
        Insert: {
          arco_procedure?: string | null
          change_notice_method?: string | null
          consent_required_purposes?: string | null
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          data_categories?: string | null
          effective_from?: string | null
          id?: string
          integral_notice?: string | null
          limitation_mechanisms?: string | null
          published_at?: string | null
          published_by?: string | null
          purposes?: string | null
          responsible_address?: string | null
          responsible_name?: string | null
          sensitive_data_categories?: string | null
          simplified_notice?: string | null
          status?: string
          transfer_clause?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          arco_procedure?: string | null
          change_notice_method?: string | null
          consent_required_purposes?: string | null
          contact_email?: string | null
          created_at?: string
          created_by?: string | null
          data_categories?: string | null
          effective_from?: string | null
          id?: string
          integral_notice?: string | null
          limitation_mechanisms?: string | null
          published_at?: string | null
          published_by?: string | null
          purposes?: string | null
          responsible_address?: string | null
          responsible_name?: string | null
          sensitive_data_categories?: string | null
          simplified_notice?: string | null
          status?: string
          transfer_clause?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
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
          client_event_id: string | null
          created_at: string
          enrollment_id: string
          id: string
          marked_by: string | null
          notes: string | null
          outside_window: boolean
          recorded_at: string
          session_id: string | null
          source: string
          updated_at: string
        }
        Insert: {
          attendance_date?: string
          client_event_id?: string | null
          created_at?: string
          enrollment_id: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          outside_window?: boolean
          recorded_at?: string
          session_id?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          client_event_id?: string | null
          created_at?: string
          enrollment_id?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          outside_window?: boolean
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
          unlocked_from_enrollment_id: string | null
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
          unlocked_from_enrollment_id?: string | null
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
          unlocked_from_enrollment_id?: string | null
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
            foreignKeyName: "program_enrollments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "program_enrollments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "program_enrollments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "program_enrollments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "program_enrollments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
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
          {
            foreignKeyName: "program_enrollments_unlocked_from_enrollment_id_fkey"
            columns: ["unlocked_from_enrollment_id"]
            isOneToOne: false
            referencedRelation: "program_enrollments"
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
      restaurant_menu_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_menu_items: {
        Row: {
          category_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "restaurant_menu_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_award_definitions: {
        Row: {
          code: string
          created_at: string
          description: string | null
          icon_key: string | null
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          icon_key?: string | null
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          icon_key?: string | null
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ucapsa_competition_adjustments: {
        Row: {
          created_at: string
          created_by: string
          dog_id: string
          id: string
          import_batch_id: string | null
          note: string | null
          occurred_at: string
          points: number
          reversal_of_id: string | null
          season_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          dog_id: string
          id?: string
          import_batch_id?: string | null
          note?: string | null
          occurred_at?: string
          points: number
          reversal_of_id?: string | null
          season_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          dog_id?: string
          id?: string
          import_batch_id?: string | null
          note?: string | null
          occurred_at?: string
          points?: number
          reversal_of_id?: string | null
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_import_preview"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_adjustments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_competition_seasons: {
        Row: {
          activated_at: string | null
          activated_by: string | null
          closed_at: string | null
          closed_by: string | null
          code: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          name: string
          reopened_at: string | null
          reopened_by: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          activated_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          name: string
          reopened_at?: string | null
          reopened_by?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          activated_by?: string | null
          closed_at?: string | null
          closed_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          name?: string
          reopened_at?: string | null
          reopened_by?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ucapsa_exam_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          created_by: string | null
          dog_id: string
          exam_id: string
          id: string
          import_batch_id: string | null
          is_official: boolean
          presented_at: string
          published_at: string | null
          published_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          created_by?: string | null
          dog_id: string
          exam_id: string
          id?: string
          import_batch_id?: string | null
          is_official?: boolean
          presented_at: string
          published_at?: string | null
          published_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          attempt_number?: number
          created_at?: string
          created_by?: string | null
          dog_id?: string
          exam_id?: string
          id?: string
          import_batch_id?: string | null
          is_official?: boolean
          presented_at?: string
          published_at?: string | null
          published_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_import_preview"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_exam_import_rows: {
        Row: {
          attempt_id: string | null
          batch_id: string
          created_at: string
          dog_id: string | null
          dog_name: string | null
          id: string
          member_number: string | null
          raw_data: Json
          row_number: number
          scores: Json
          updated_at: string
          validation_errors: Json
          validation_status: string
        }
        Insert: {
          attempt_id?: string | null
          batch_id: string
          created_at?: string
          dog_id?: string | null
          dog_name?: string | null
          id?: string
          member_number?: string | null
          raw_data?: Json
          row_number: number
          scores?: Json
          updated_at?: string
          validation_errors?: Json
          validation_status?: string
        }
        Update: {
          attempt_id?: string | null
          batch_id?: string
          created_at?: string
          dog_id?: string | null
          dog_name?: string | null
          id?: string
          member_number?: string | null
          raw_data?: Json
          row_number?: number
          scores?: Json
          updated_at?: string
          validation_errors?: Json
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_import_rows_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_import_preview"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
        ]
      }
      ucapsa_exam_item_results: {
        Row: {
          attempt_id: string
          created_at: string
          evaluator_note: string | null
          exam_item_id: string
          points_awarded: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attempt_id: string
          created_at?: string
          evaluator_note?: string | null
          exam_item_id: string
          points_awarded: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attempt_id?: string
          created_at?: string
          evaluator_note?: string | null
          exam_item_id?: string
          points_awarded?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_item_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_item_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_item_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_item_results_exam_item_id_fkey"
            columns: ["exam_item_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_exam_items: {
        Row: {
          created_at: string
          description: string | null
          exam_id: string
          id: string
          item_number: number
          max_points: number
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exam_id: string
          id?: string
          item_number: number
          max_points: number
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exam_id?: string
          id?: string
          item_number?: number
          max_points?: number
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_items_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_items_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_items_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_exams: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          exam_date: string | null
          id: string
          is_required_for_ranking: boolean
          published_at: string | null
          published_by: string | null
          season_id: string
          sort_order: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          exam_date?: string | null
          id?: string
          is_required_for_ranking?: boolean
          published_at?: string | null
          published_by?: string | null
          season_id: string
          sort_order?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          exam_date?: string | null
          id?: string
          is_required_for_ranking?: boolean
          published_at?: string | null
          published_by?: string | null
          season_id?: string
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_import_batches: {
        Row: {
          committed_at: string | null
          created_at: string
          created_by: string
          exam_id: string | null
          file_name: string | null
          id: string
          import_type: string
          metadata: Json
          reverted_at: string | null
          season_id: string
          status: string
          updated_at: string
        }
        Insert: {
          committed_at?: string | null
          created_at?: string
          created_by: string
          exam_id?: string | null
          file_name?: string | null
          id?: string
          import_type: string
          metadata?: Json
          reverted_at?: string | null
          season_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          committed_at?: string | null
          created_at?: string
          created_by?: string
          exam_id?: string | null
          file_name?: string | null
          id?: string
          import_type?: string
          metadata?: Json
          reverted_at?: string | null
          season_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_import_batches_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_points_ledger: {
        Row: {
          awarded_by: string | null
          created_at: string
          dedupe_key: string
          id: string
          metadata: Json
          occurred_at: string
          participant_id: string
          points: number
          reason: string
          reversal_of_id: string | null
          rule_code: string
          season_id: string
          source_id: string | null
          source_type: string
        }
        Insert: {
          awarded_by?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          metadata?: Json
          occurred_at?: string
          participant_id: string
          points: number
          reason: string
          reversal_of_id?: string | null
          rule_code: string
          season_id: string
          source_id?: string | null
          source_type: string
        }
        Update: {
          awarded_by?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          participant_id?: string
          points?: number
          reason?: string
          reversal_of_id?: string | null
          rule_code?: string
          season_id?: string
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_points_ledger_participant_fk"
            columns: ["participant_id", "season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_points_participants"
            referencedColumns: ["id", "season_id"]
          },
          {
            foreignKeyName: "ucapsa_points_ledger_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_points_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_points_ledger_rule_fk"
            columns: ["season_id", "rule_code"]
            isOneToOne: false
            referencedRelation: "ucapsa_points_rules"
            referencedColumns: ["season_id", "code"]
          },
        ]
      }
      ucapsa_points_participants: {
        Row: {
          created_at: string
          display_name: string
          dog_id: string
          id: string
          joined_at: string
          locked_at: string | null
          metadata: Json
          season_id: string
          status: string
          updated_at: string
          user_id: string
          visible_in_leaderboard: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          dog_id: string
          id?: string
          joined_at?: string
          locked_at?: string | null
          metadata?: Json
          season_id: string
          status?: string
          updated_at?: string
          user_id: string
          visible_in_leaderboard?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          dog_id?: string
          id?: string
          joined_at?: string
          locked_at?: string | null
          metadata?: Json
          season_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          visible_in_leaderboard?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_points_participants_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_points_participants_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_points_participants_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_points_participants_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_points_participants_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_points_participants_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_points_participants_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_points_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_points_rules: {
        Row: {
          code: string
          created_at: string
          default_points: number
          id: string
          is_active: boolean
          label: string
          max_awards_per_day: number | null
          metadata: Json
          season_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_points?: number
          id?: string
          is_active?: boolean
          label: string
          max_awards_per_day?: number | null
          metadata?: Json
          season_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_points?: number
          id?: string
          is_active?: boolean
          label?: string
          max_awards_per_day?: number | null
          metadata?: Json
          season_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_points_rules_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_points_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_points_seasons: {
        Row: {
          code: string
          created_at: string
          eligibility_scope: string
          ends_at: string
          id: string
          metadata: Json
          name: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          eligibility_scope?: string
          ends_at: string
          id?: string
          metadata?: Json
          name: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          eligibility_scope?: string
          ends_at?: string
          id?: string
          metadata?: Json
          name?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ucapsa_points_tiers: {
        Row: {
          code: string
          created_at: string
          icon_key: string | null
          id: string
          label: string
          metadata: Json
          min_points: number
          season_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          icon_key?: string | null
          id?: string
          label: string
          metadata?: Json
          min_points: number
          season_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          icon_key?: string | null
          id?: string
          label?: string
          metadata?: Json
          min_points?: number
          season_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_points_tiers_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_points_seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      ucapsa_value_exposures: {
        Row: {
          created_at: string
          dog_id: string
          event_date: string
          id: string
          occurred_at: string
          season_id: string
          surface: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dog_id: string
          event_date?: string
          id?: string
          occurred_at?: string
          season_id: string
          surface: string
          user_id: string
        }
        Update: {
          created_at?: string
          dog_id?: string
          event_date?: string
          id?: string
          occurred_at?: string
          season_id?: string
          surface?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_value_exposures_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_value_exposures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_code: string
          awarded_at: string
          awarded_by: string | null
          created_at: string
          dog_id: string | null
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
          dog_id?: string | null
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
          dog_id?: string | null
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
          {
            foreignKeyName: "user_achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "user_achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "user_achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "user_achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "user_achievements_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
        ]
      }
    }
    Views: {
      ucapsa_competition_adjustment_summary: {
        Row: {
          adjustment_points: number | null
          dog_id: string | null
          dog_name: string | null
          last_adjustment_at: string | null
          movement_count: number | null
          season_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_competition_adjustments_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_competition_inputs: {
        Row: {
          admin_adjustment_movement_count: number | null
          admin_adjustment_points: number | null
          command_attendances_count: number | null
          completed_required_exams_count: number | null
          constancy_events_count: number | null
          dog_id: string | null
          dog_is_active: boolean | null
          dog_name: string | null
          first_event_date: string | null
          has_competition_activity: boolean | null
          is_ranking_eligible: boolean | null
          last_adjustment_at: string | null
          last_event_date: string | null
          last_exam_published_at: string | null
          member_visits_count: number | null
          missing_required_exams_count: number | null
          official_exam_max_points: number | null
          official_exam_points_awarded: number | null
          official_exams_count: number | null
          optional_exam_max_points: number | null
          optional_exam_points_awarded: number | null
          optional_official_exams_count: number | null
          owner_user_id: string | null
          required_exam_max_points: number | null
          required_exam_points_awarded: number | null
          required_exams_count: number | null
          required_official_exams_count: number | null
          season_code: string | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
        }
        Relationships: []
      }
      ucapsa_competition_leaderboard: {
        Row: {
          admin_adjustment_points: number | null
          command_attendances_count: number | null
          competitive_score: number | null
          completed_required_exams_count: number | null
          constancy_percentile: number | null
          constancy_points: number | null
          constancy_population_count: number | null
          dog_id: string | null
          dog_is_active: boolean | null
          dog_name: string | null
          eligible_dogs_count: number | null
          exam_points: number | null
          has_sufficient_constancy_population: boolean | null
          is_constancy_outstanding: boolean | null
          last_adjustment_at: string | null
          last_event_date: string | null
          last_exam_published_at: string | null
          member_visits_count: number | null
          missing_required_exams_count: number | null
          range_code: string | null
          range_level: number | null
          range_name: string | null
          ranking_position: number | null
          required_exams_count: number | null
          season_code: string | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
        }
        Relationships: []
      }
      ucapsa_competition_ranges: {
        Row: {
          admin_adjustment_movement_count: number | null
          admin_adjustment_points: number | null
          command_attendances_count: number | null
          competitive_score: number | null
          completed_required_exams_count: number | null
          constancy_events_count: number | null
          constancy_percent_rank: number | null
          constancy_percentile: number | null
          constancy_points: number | null
          constancy_population_count: number | null
          dog_id: string | null
          dog_is_active: boolean | null
          dog_name: string | null
          exam_points: number | null
          first_event_date: string | null
          has_competition_activity: boolean | null
          has_sufficient_constancy_population: boolean | null
          is_constancy_outstanding: boolean | null
          is_ranking_eligible: boolean | null
          last_adjustment_at: string | null
          last_event_date: string | null
          last_exam_published_at: string | null
          member_visits_count: number | null
          missing_required_exams_count: number | null
          official_exam_max_points: number | null
          official_exam_points_awarded: number | null
          official_exams_count: number | null
          optional_official_exams_count: number | null
          owner_user_id: string | null
          range_code: string | null
          range_level: number | null
          range_name: string | null
          required_exams_count: number | null
          required_official_exams_count: number | null
          season_code: string | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
        }
        Relationships: []
      }
      ucapsa_competition_scores: {
        Row: {
          admin_adjustment_movement_count: number | null
          admin_adjustment_points: number | null
          command_attendances_count: number | null
          competitive_score: number | null
          completed_required_exams_count: number | null
          constancy_events_count: number | null
          constancy_points: number | null
          dog_id: string | null
          dog_is_active: boolean | null
          dog_name: string | null
          exam_points: number | null
          first_event_date: string | null
          has_competition_activity: boolean | null
          is_ranking_eligible: boolean | null
          last_adjustment_at: string | null
          last_event_date: string | null
          last_exam_published_at: string | null
          member_visits_count: number | null
          missing_required_exams_count: number | null
          official_exam_max_points: number | null
          official_exam_points_awarded: number | null
          official_exams_count: number | null
          optional_official_exams_count: number | null
          owner_user_id: string | null
          required_exams_count: number | null
          required_official_exams_count: number | null
          season_code: string | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
        }
        Relationships: []
      }
      ucapsa_constancy_events: {
        Row: {
          dog_id: string | null
          enrollment_id: string | null
          event_date: string | null
          event_type: string | null
          member_visit_id: string | null
          season_id: string | null
          session_id: string | null
          source: string | null
          source_id: string | null
        }
        Relationships: []
      }
      ucapsa_constancy_summary: {
        Row: {
          command_attendances_count: number | null
          constancy_events_count: number | null
          dog_id: string | null
          first_event_date: string | null
          last_event_date: string | null
          member_visits_count: number | null
          season_id: string | null
        }
        Relationships: []
      }
      ucapsa_continuity_observations: {
        Row: {
          activity_events_after_exposure: number | null
          activity_within_30d_after_exposure: number | null
          activity_within_60d_after_exposure: number | null
          activity_within_7d_after_exposure: number | null
          activity_within_90d_after_exposure: number | null
          any_payment_within_30d_after_exposure: number | null
          any_payment_within_60d_after_exposure: number | null
          any_payment_within_7d_after_exposure: number | null
          any_payment_within_90d_after_exposure: number | null
          cohort_activity_events_30d: number | null
          cohort_any_payments_30d: number | null
          cohort_followup_complete: boolean | null
          cohort_membership_payments_30d: number | null
          command_attendances_count: number | null
          constancy_events_count: number | null
          current_payment_status: string | null
          days_since_last_activity: number | null
          days_to_next_activity: number | null
          days_to_next_membership_payment: number | null
          days_to_next_payment: number | null
          delete_request_after_exposure: boolean | null
          dog_count: number | null
          early_value_exposure: boolean | null
          email: string | null
          first_activity_date: string | null
          first_delete_request_after_exposure: string | null
          first_exposure_at: string | null
          full_name: string | null
          has_value_exposure: boolean | null
          last_activity_date: string | null
          last_exposure_at: string | null
          last_payment_at: string | null
          member_visits_count: number | null
          membership_id: string | null
          membership_is_active: boolean | null
          membership_paid_payments_after_exposure: number | null
          membership_payment_within_30d_after_exposure: number | null
          membership_payment_within_60d_after_exposure: number | null
          membership_payment_within_7d_after_exposure: number | null
          membership_payment_within_90d_after_exposure: number | null
          membership_status: string | null
          next_activity_date: string | null
          next_membership_paid_at: string | null
          next_paid_at: string | null
          paid_payments_after_exposure: number | null
          saw_constancy_detail: boolean | null
          saw_constancy_summary: boolean | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
          user_id: string | null
          value_exposure_days: number | null
        }
        Relationships: []
      }
      ucapsa_dog_award_summary: {
        Row: {
          award_code: string | null
          award_id: string | null
          awarded_at: string | null
          description: string | null
          dog_id: string | null
          dog_name: string | null
          icon_key: string | null
          note: string | null
          season_id: string | null
          season_name: string | null
          title: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dog_awards_award_code_fkey"
            columns: ["award_code"]
            isOneToOne: false
            referencedRelation: "ucapsa_award_definitions"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "dog_awards_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_exam_attempt_summary: {
        Row: {
          attempt_id: string | null
          attempt_number: number | null
          attempt_status: string | null
          dog_id: string | null
          exam_code: string | null
          exam_date: string | null
          exam_id: string | null
          exam_status: string | null
          exam_title: string | null
          graded_items_count: number | null
          is_complete: boolean | null
          is_official: boolean | null
          is_required_for_ranking: boolean | null
          items_count: number | null
          max_points: number | null
          presented_at: string | null
          published_at: string | null
          season_id: string | null
          total_points_awarded: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_exam_eligibility: {
        Row: {
          completed_required_exams_count: number | null
          dog_id: string | null
          is_ranking_eligible: boolean | null
          missing_required_exams_count: number | null
          required_exams_count: number | null
          season_id: string | null
        }
        Relationships: []
      }
      ucapsa_exam_import_preview: {
        Row: {
          attempt_id: string | null
          batch_id: string | null
          batch_status: string | null
          dog_id: string | null
          dog_name: string | null
          exam_id: string | null
          file_name: string | null
          import_row_id: string | null
          max_points: number | null
          member_number: string | null
          resolved_dog_name: string | null
          row_number: number | null
          scores: Json | null
          season_id: string | null
          total_points_awarded: number | null
          validation_errors: Json | null
          validation_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_import_rows_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["attempt_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_import_rows_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_attempt_summary"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_official_results"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_import_batches_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
      ucapsa_exam_official_results: {
        Row: {
          attempt_id: string | null
          attempt_number: number | null
          attempt_status: string | null
          dog_id: string | null
          exam_code: string | null
          exam_date: string | null
          exam_id: string | null
          exam_status: string | null
          exam_title: string | null
          graded_items_count: number | null
          is_complete: boolean | null
          is_official: boolean | null
          is_required_for_ranking: boolean | null
          items_count: number | null
          max_points: number | null
          presented_at: string | null
          published_at: string | null
          season_id: string | null
          total_points_awarded: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "dogs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exam_attempts_dog_id_fkey"
            columns: ["dog_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["dog_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_inputs"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_leaderboard"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_ranges"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_scores"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_competition_seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_continuity_observations"
            referencedColumns: ["season_id"]
          },
          {
            foreignKeyName: "ucapsa_exams_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "ucapsa_exam_eligibility"
            referencedColumns: ["season_id"]
          },
        ]
      }
    }
    Functions: {
      admin_activate_ucapsa_competition_season: {
        Args: { p_season_id: string }
        Returns: string
      }
      admin_add_ucapsa_competition_adjustment: {
        Args: {
          p_dog_id: string
          p_note?: string
          p_points: number
          p_season_id: string
        }
        Returns: string
      }
      admin_add_ucapsa_exam_item: {
        Args: {
          p_description?: string
          p_exam_id: string
          p_item_number?: number
          p_max_points: number
          p_sort_order?: number
          p_title: string
        }
        Returns: string
      }
      admin_adjust_ucapsa_points: {
        Args: {
          p_dog_id: string
          p_points: number
          p_reason: string
          p_user_id: string
        }
        Returns: {
          ledger_id: string
          participant_id: string
          total_points: number
        }[]
      }
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
      admin_close_ucapsa_competition_season: {
        Args: { p_season_id: string }
        Returns: string
      }
      admin_commit_ucapsa_exam_import_batch: {
        Args: { p_batch_id: string }
        Returns: string
      }
      admin_complete_account_deletion_request: {
        Args: {
          p_notification_method: string
          p_notification_reference: string
          p_request_id: string
          p_resolution_note: string
        }
        Returns: {
          created_at: string
          id: string
          notification_method: string | null
          notification_reference: string | null
          notified_at: string | null
          reason: string | null
          requested_at: string
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          retention_until: string | null
          snapshot_email: string | null
          snapshot_name: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_basic_dog: {
        Args: { p_name: string; p_user_id: string }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }[]
      }
      admin_create_ucapsa_competition_season: {
        Args: {
          p_code: string
          p_ends_on: string
          p_name: string
          p_starts_on: string
        }
        Returns: string
      }
      admin_create_ucapsa_exam: {
        Args: {
          p_code: string
          p_description?: string
          p_exam_date?: string
          p_is_required_for_ranking?: boolean
          p_season_id: string
          p_sort_order?: number
          p_title: string
        }
        Returns: string
      }
      admin_create_ucapsa_exam_attempt: {
        Args: { p_dog_id: string; p_exam_id: string; p_presented_at?: string }
        Returns: string
      }
      admin_create_ucapsa_exam_import_batch: {
        Args: { p_exam_id: string; p_file_name?: string }
        Returns: string
      }
      admin_delete_ucapsa_exam_item: {
        Args: { p_exam_item_id: string }
        Returns: string
      }
      admin_delete_ucapsa_exam_item_result: {
        Args: { p_attempt_id: string; p_exam_item_id: string }
        Returns: string
      }
      admin_grant_ucapsa_dog_award: {
        Args: {
          p_award_code: string
          p_dog_id: string
          p_note?: string
          p_season_id?: string
        }
        Returns: string
      }
      admin_grant_ucapsa_training_achievement: {
        Args: { p_achievement_code: string; p_dog_id: string }
        Returns: string
      }
      admin_publish_privacy_notice: {
        Args: { p_id: string }
        Returns: {
          arco_procedure: string | null
          change_notice_method: string | null
          consent_required_purposes: string | null
          contact_email: string | null
          created_at: string
          created_by: string | null
          data_categories: string | null
          effective_from: string | null
          id: string
          integral_notice: string | null
          limitation_mechanisms: string | null
          published_at: string | null
          published_by: string | null
          purposes: string | null
          responsible_address: string | null
          responsible_name: string | null
          sensitive_data_categories: string | null
          simplified_notice: string | null
          status: string
          transfer_clause: string | null
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "privacy_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_publish_ucapsa_exam: {
        Args: { p_exam_id: string }
        Returns: string
      }
      admin_publish_ucapsa_exam_attempt: {
        Args: { p_attempt_id: string; p_make_official?: boolean }
        Returns: string
      }
      admin_publish_ucapsa_exam_import_batch: {
        Args: { p_batch_id: string; p_make_official?: boolean }
        Returns: string
      }
      admin_reopen_ucapsa_competition_season: {
        Args: { p_season_id: string }
        Returns: string
      }
      admin_reverse_ucapsa_competition_adjustment: {
        Args: { p_adjustment_id: string; p_note?: string }
        Returns: string
      }
      admin_revert_ucapsa_exam_import_batch: {
        Args: { p_batch_id: string }
        Returns: string
      }
      admin_review_ucapsa_exam_attempt: {
        Args: { p_attempt_id: string }
        Returns: string
      }
      admin_review_ucapsa_exam_import_batch: {
        Args: { p_batch_id: string }
        Returns: string
      }
      admin_revoke_ucapsa_dog_award: {
        Args: { p_award_id: string; p_note?: string }
        Returns: string
      }
      admin_revoke_ucapsa_training_achievement: {
        Args: { p_achievement_code: string; p_dog_id: string }
        Returns: string
      }
      admin_save_privacy_notice: {
        Args: {
          p_arco_procedure: string
          p_change_notice_method: string
          p_consent_required_purposes: string
          p_contact_email: string
          p_data_categories: string
          p_effective_from?: string
          p_id: string
          p_integral_notice: string
          p_limitation_mechanisms: string
          p_purposes: string
          p_responsible_address: string
          p_responsible_name: string
          p_sensitive_data_categories: string
          p_simplified_notice: string
          p_transfer_clause: string
          p_version: string
        }
        Returns: {
          arco_procedure: string | null
          change_notice_method: string | null
          consent_required_purposes: string | null
          contact_email: string | null
          created_at: string
          created_by: string | null
          data_categories: string | null
          effective_from: string | null
          id: string
          integral_notice: string | null
          limitation_mechanisms: string | null
          published_at: string | null
          published_by: string | null
          purposes: string | null
          responsible_address: string | null
          responsible_name: string | null
          sensitive_data_categories: string | null
          simplified_notice: string | null
          status: string
          transfer_clause: string | null
          updated_at: string
          version: string
        }
        SetofOptions: {
          from: "*"
          to: "privacy_notices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_ucapsa_exam_official_attempt: {
        Args: { p_attempt_id: string }
        Returns: string
      }
      admin_update_account_deletion_request: {
        Args: {
          p_request_id: string
          p_resolution_note?: string
          p_retention_until?: string
          p_status: string
        }
        Returns: {
          created_at: string
          id: string
          notification_method: string | null
          notification_reference: string | null
          notified_at: string | null
          reason: string | null
          requested_at: string
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          retention_until: string | null
          snapshot_email: string | null
          snapshot_name: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_ucapsa_competition_season: {
        Args: {
          p_code: string
          p_ends_on: string
          p_name: string
          p_season_id: string
          p_starts_on: string
        }
        Returns: string
      }
      admin_update_ucapsa_exam: {
        Args: {
          p_code: string
          p_description: string
          p_exam_date: string
          p_exam_id: string
          p_is_required_for_ranking: boolean
          p_sort_order: number
          p_title: string
        }
        Returns: string
      }
      admin_update_ucapsa_exam_item: {
        Args: {
          p_description: string
          p_exam_item_id: string
          p_item_number: number
          p_max_points: number
          p_sort_order: number
          p_title: string
        }
        Returns: string
      }
      admin_upsert_ucapsa_exam_item_result: {
        Args: {
          p_attempt_id: string
          p_evaluator_note?: string
          p_exam_item_id: string
          p_points_awarded: number
        }
        Returns: string
      }
      admin_validate_ucapsa_exam_import_batch: {
        Args: { p_batch_id: string; p_rows: Json }
        Returns: string
      }
      admin_void_ucapsa_exam_attempt: {
        Args: { p_attempt_id: string }
        Returns: string
      }
      correct_member_visit_admin: {
        Args: { p_notes?: string; p_visit_id: string; p_visited_at: string }
        Returns: undefined
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
      delete_member_visit_admin: {
        Args: { p_visit_id: string }
        Returns: undefined
      }
      delete_program_attendance_admin: {
        Args: { p_attendance_id: string }
        Returns: undefined
      }
      disable_notification_token: {
        Args: { p_expo_push_token: string }
        Returns: undefined
      }
      ensure_ucapsa_points_participant: {
        Args: { p_dog_id: string; p_user_id: string }
        Returns: string
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
      get_admin_member_visit_monthly_stats: {
        Args: { p_months?: number }
        Returns: {
          month_start: string
          total_visits: number
          unique_members: number
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
      get_internal_cron_secret: { Args: never; Returns: string }
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
      get_ucapsa_competition_leaderboard: {
        Args: { p_season_id: string }
        Returns: {
          admin_adjustment_points: number | null
          command_attendances_count: number | null
          competitive_score: number | null
          completed_required_exams_count: number | null
          constancy_percentile: number | null
          constancy_points: number | null
          constancy_population_count: number | null
          dog_id: string | null
          dog_is_active: boolean | null
          dog_name: string | null
          eligible_dogs_count: number | null
          exam_points: number | null
          has_sufficient_constancy_population: boolean | null
          is_constancy_outstanding: boolean | null
          last_adjustment_at: string | null
          last_event_date: string | null
          last_exam_published_at: string | null
          member_visits_count: number | null
          missing_required_exams_count: number | null
          range_code: string | null
          range_level: number | null
          range_name: string | null
          ranking_position: number | null
          required_exams_count: number | null
          season_code: string | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ucapsa_competition_leaderboard"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_ucapsa_continuity_observations: {
        Args: never
        Returns: {
          activity_events_after_exposure: number | null
          activity_within_30d_after_exposure: number | null
          activity_within_60d_after_exposure: number | null
          activity_within_7d_after_exposure: number | null
          activity_within_90d_after_exposure: number | null
          any_payment_within_30d_after_exposure: number | null
          any_payment_within_60d_after_exposure: number | null
          any_payment_within_7d_after_exposure: number | null
          any_payment_within_90d_after_exposure: number | null
          cohort_activity_events_30d: number | null
          cohort_any_payments_30d: number | null
          cohort_followup_complete: boolean | null
          cohort_membership_payments_30d: number | null
          command_attendances_count: number | null
          constancy_events_count: number | null
          current_payment_status: string | null
          days_since_last_activity: number | null
          days_to_next_activity: number | null
          days_to_next_membership_payment: number | null
          days_to_next_payment: number | null
          delete_request_after_exposure: boolean | null
          dog_count: number | null
          early_value_exposure: boolean | null
          email: string | null
          first_activity_date: string | null
          first_delete_request_after_exposure: string | null
          first_exposure_at: string | null
          full_name: string | null
          has_value_exposure: boolean | null
          last_activity_date: string | null
          last_exposure_at: string | null
          last_payment_at: string | null
          member_visits_count: number | null
          membership_id: string | null
          membership_is_active: boolean | null
          membership_paid_payments_after_exposure: number | null
          membership_payment_within_30d_after_exposure: number | null
          membership_payment_within_60d_after_exposure: number | null
          membership_payment_within_7d_after_exposure: number | null
          membership_payment_within_90d_after_exposure: number | null
          membership_status: string | null
          next_activity_date: string | null
          next_membership_paid_at: string | null
          next_paid_at: string | null
          paid_payments_after_exposure: number | null
          saw_constancy_detail: boolean | null
          saw_constancy_summary: boolean | null
          season_ends_at: string | null
          season_id: string | null
          season_name: string | null
          season_starts_at: string | null
          season_status: string | null
          user_id: string | null
          value_exposure_days: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "ucapsa_continuity_observations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_ucapsa_points_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          display_name: string
          dog_id: string
          is_current_user: boolean
          is_tied: boolean
          rank: number
          tier_code: string
          tier_label: string
          total_points: number
        }[]
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
      record_ucapsa_value_exposure: {
        Args: {
          p_dog_id: string
          p_occurred_at?: string
          p_season_id: string
          p_surface: string
        }
        Returns: undefined
      }
      refresh_program_enrollment_progress: {
        Args: { p_enrollment_id: string }
        Returns: undefined
      }
      register_member_visit_admin: {
        Args: { p_notes?: string; p_user_id: string; p_visited_at?: string }
        Returns: string
      }
      register_member_visit_from_qr:
        | {
            Args: { p_qr_token: string }
            Returns: {
              message: string
              result: string
              visit_id: string
            }[]
          }
        | {
            Args: { p_client_event_id: string; p_qr_token: string }
            Returns: {
              message: string
              result: string
              visit_id: string
            }[]
          }
        | {
            Args: {
              p_captured_at: string
              p_client_event_id: string
              p_qr_token: string
            }
            Returns: {
              message: string
              result: string
              visit_id: string
            }[]
          }
      register_my_practice_session: {
        Args: {
          p_client_event_id: string
          p_completed_at: string
          p_difficulty: string
          p_duration_seconds?: number
          p_enrollment_id: string
          p_note?: string
          p_started_at: string
        }
        Returns: string
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
      register_program_attendance_from_qr:
        | {
            Args: { p_enrollment_id: string; p_qr_token: string }
            Returns: {
              attendance_id: string
              message: string
              result: string
              session_id: string
            }[]
          }
        | {
            Args: {
              p_confirm_outside_window: boolean
              p_enrollment_id: string
              p_qr_token: string
            }
            Returns: {
              attendance_id: string
              message: string
              result: string
              session_id: string
            }[]
          }
        | {
            Args: {
              p_captured_at: string
              p_client_event_id: string
              p_confirm_outside_window: boolean
              p_enrollment_id: string
              p_qr_token: string
            }
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
      request_my_account_deletion: {
        Args: { p_reason?: string }
        Returns: {
          created_at: string
          id: string
          notification_method: string | null
          notification_reference: string | null
          notified_at: string | null
          reason: string | null
          requested_at: string
          requested_by: string | null
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          retention_until: string | null
          snapshot_email: string | null
          snapshot_name: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "account_deletion_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rotate_attendance_qr_code: {
        Args: { p_program_code: string }
        Returns: string
      }
      ucapsa_achievement_code_for_enrollment: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      ucapsa_assert_competition_date_mutable: {
        Args: { p_event_date: string }
        Returns: undefined
      }
      ucapsa_assert_competition_season_mutable: {
        Args: { p_season_id: string }
        Returns: undefined
      }
      ucapsa_assert_exam_attempt_mutable: {
        Args: { p_attempt_id: string }
        Returns: undefined
      }
      ucapsa_assert_exam_mutable: {
        Args: { p_exam_id: string }
        Returns: undefined
      }
      ucapsa_exam_admin_audit: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: undefined
      }
      ucapsa_exam_import_snapshot: {
        Args: { p_exam_id: string }
        Returns: Json
      }
      ucapsa_program_completion_achievement_code: {
        Args: { p_program_id: string; p_program_level: string }
        Returns: string
      }
      ucapsa_unlock_next_comandos_level: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      ucapsa_unlock_next_program_stage: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      unlock_next_program_stage: {
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
