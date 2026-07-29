export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          acknowledged_at: string | null
          id: string
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          id?: string
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_audit_events: {
        Row: { action: string; actor_user_id: string; created_at: string; id: string; metadata: Json; target_id: string | null; target_type: string }
        Insert: { action: string; actor_user_id: string; created_at?: string; id?: string; metadata?: Json; target_id?: string | null; target_type: string }
        Update: { action?: string; actor_user_id?: string; created_at?: string; id?: string; metadata?: Json; target_id?: string | null; target_type?: string }
        Relationships: []
      }
      feedback_submissions: {
        Row: { analysis_id: string | null; category: string; comment: string | null; created_at: string; current_route: string | null; id: string; may_contact: boolean; session_id: string | null; usefulness: string | null; user_id: string }
        Insert: { analysis_id?: string | null; category: string; comment?: string | null; created_at?: string; current_route?: string | null; id?: string; may_contact?: boolean; session_id?: string | null; usefulness?: string | null; user_id: string }
        Update: { analysis_id?: string | null; category?: string; comment?: string | null; created_at?: string; current_route?: string | null; id?: string; may_contact?: boolean; session_id?: string | null; usefulness?: string | null; user_id?: string }
        Relationships: []
      }
      onboarding_states: {
        Row: { completed_at: string | null; current_step: number; onboarding_version: string; scientific_boundary_acknowledged: boolean; state: string; updated_at: string; user_id: string }
        Insert: { completed_at?: string | null; current_step?: number; onboarding_version: string; scientific_boundary_acknowledged?: boolean; state?: string; updated_at?: string; user_id: string }
        Update: { completed_at?: string | null; current_step?: number; onboarding_version?: string; scientific_boundary_acknowledged?: boolean; state?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      support_requests: {
        Row: { analysis_id: string | null; category: string; created_at: string; diagnostic_context: Json; id: string; message: string; safe_reference_id: string; session_id: string | null; status: string; subject: string; updated_at: string; user_id: string }
        Insert: { analysis_id?: string | null; category: string; created_at?: string; diagnostic_context?: Json; id?: string; message: string; safe_reference_id: string; session_id?: string | null; status?: string; subject: string; updated_at?: string; user_id: string }
        Update: { analysis_id?: string | null; category?: string; created_at?: string; diagnostic_context?: Json; id?: string; message?: string; safe_reference_id?: string; session_id?: string | null; status?: string; subject?: string; updated_at?: string; user_id?: string }
        Relationships: []
      }
      analyses: {
        Row: {
          analysis_fps: number | null
          analysis_kind: string
          analysis_pipeline_version: string | null
          athlete_tracking_confidence: number | null
          athlete_tracking_version: string | null
          camera_motion_confidence: number | null
          camera_motion_model_version: string | null
          camera_transform_summary: Json | null
          compatibility_group: string
          completed_at: string | null
          created_at: string
          dynamic_crop_version: string | null
          error: string | null
          excluded_from_benchmarks: boolean
          excluded_from_history_trends: boolean
          excluded_from_predictions: boolean
          excluded_from_recommendations: boolean
          experiment_version: string | null
          experimental: boolean
          experimental_raw_fly_time_seconds: number | null
          experimental_reported_fly_time_seconds: number | null
          experimental_result: Json | null
          experimental_timing_result_hash: string | null
          experimental_timing_uncertainty_seconds: number | null
          explainability_schema_version: string | null
          id: string
          input_snapshot: Json | null
          is_current_working: boolean
          keypoints_path: string | null
          metric_schema_version: string | null
          metrics: Json | null
          model_version: string
          parent_analysis_id: string | null
          performance_result_invalid_reason: string | null
          performance_result_invalidated_at: string | null
          performance_result_status: string
          provenance: Json | null
          raw_timing_metrics: Json | null
          recording_mode: string | null
          recording_mode_version: string | null
          reported_timing_metrics: Json | null
          result_payload: Json | null
          saved_at: string | null
          saved_notes: string | null
          saved_version_number: number | null
          session_id: string
          source_fps: number | null
          source_fps_tier: string | null
          source_fps_tier_policy_version: string | null
          source_fps_tier_reason: string | null
          spatial_metric_eligibility: string | null
          status: Database["public"]["Enums"]["analysis_status"]
          superseded_at: string | null
          timing_compatibility_group: string
          timing_policy_version: string | null
          tracking_loss_ranges: Json | null
          unstable_frame_ranges: Json | null
          validation_status: string
          version_number: number
          workspace_config: Json
          zoom_classification: string | null
          zoom_confidence: number | null
        }
        Insert: {
          analysis_fps?: number | null
          analysis_kind?: string
          analysis_pipeline_version?: string | null
          athlete_tracking_confidence?: number | null
          athlete_tracking_version?: string | null
          camera_motion_confidence?: number | null
          camera_motion_model_version?: string | null
          camera_transform_summary?: Json | null
          compatibility_group?: string
          completed_at?: string | null
          created_at?: string
          dynamic_crop_version?: string | null
          error?: string | null
          excluded_from_benchmarks?: boolean
          excluded_from_history_trends?: boolean
          excluded_from_predictions?: boolean
          excluded_from_recommendations?: boolean
          experiment_version?: string | null
          experimental?: boolean
          experimental_raw_fly_time_seconds?: number | null
          experimental_reported_fly_time_seconds?: number | null
          experimental_result?: Json | null
          experimental_timing_result_hash?: string | null
          experimental_timing_uncertainty_seconds?: number | null
          explainability_schema_version?: string | null
          id?: string
          input_snapshot?: Json | null
          is_current_working?: boolean
          keypoints_path?: string | null
          metric_schema_version?: string | null
          metrics?: Json | null
          model_version: string
          parent_analysis_id?: string | null
          performance_result_invalid_reason?: string | null
          performance_result_invalidated_at?: string | null
          performance_result_status?: string
          provenance?: Json | null
          raw_timing_metrics?: Json | null
          recording_mode?: string | null
          recording_mode_version?: string | null
          reported_timing_metrics?: Json | null
          result_payload?: Json | null
          saved_at?: string | null
          saved_notes?: string | null
          saved_version_number?: number | null
          session_id: string
          source_fps?: number | null
          source_fps_tier?: string | null
          source_fps_tier_policy_version?: string | null
          source_fps_tier_reason?: string | null
          spatial_metric_eligibility?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          superseded_at?: string | null
          timing_compatibility_group?: string
          timing_policy_version?: string | null
          tracking_loss_ranges?: Json | null
          unstable_frame_ranges?: Json | null
          validation_status?: string
          version_number: number
          workspace_config?: Json
          zoom_classification?: string | null
          zoom_confidence?: number | null
        }
        Update: {
          analysis_fps?: number | null
          analysis_kind?: string
          analysis_pipeline_version?: string | null
          athlete_tracking_confidence?: number | null
          athlete_tracking_version?: string | null
          camera_motion_confidence?: number | null
          camera_motion_model_version?: string | null
          camera_transform_summary?: Json | null
          compatibility_group?: string
          completed_at?: string | null
          created_at?: string
          dynamic_crop_version?: string | null
          error?: string | null
          excluded_from_benchmarks?: boolean
          excluded_from_history_trends?: boolean
          excluded_from_predictions?: boolean
          excluded_from_recommendations?: boolean
          experiment_version?: string | null
          experimental?: boolean
          experimental_raw_fly_time_seconds?: number | null
          experimental_reported_fly_time_seconds?: number | null
          experimental_result?: Json | null
          experimental_timing_result_hash?: string | null
          experimental_timing_uncertainty_seconds?: number | null
          explainability_schema_version?: string | null
          id?: string
          input_snapshot?: Json | null
          is_current_working?: boolean
          keypoints_path?: string | null
          metric_schema_version?: string | null
          metrics?: Json | null
          model_version?: string
          parent_analysis_id?: string | null
          performance_result_invalid_reason?: string | null
          performance_result_invalidated_at?: string | null
          performance_result_status?: string
          provenance?: Json | null
          raw_timing_metrics?: Json | null
          recording_mode?: string | null
          recording_mode_version?: string | null
          reported_timing_metrics?: Json | null
          result_payload?: Json | null
          saved_at?: string | null
          saved_notes?: string | null
          saved_version_number?: number | null
          session_id?: string
          source_fps?: number | null
          source_fps_tier?: string | null
          source_fps_tier_policy_version?: string | null
          source_fps_tier_reason?: string | null
          spatial_metric_eligibility?: string | null
          status?: Database["public"]["Enums"]["analysis_status"]
          superseded_at?: string | null
          timing_compatibility_group?: string
          timing_policy_version?: string | null
          tracking_loss_ranges?: Json | null
          unstable_frame_ranges?: Json | null
          validation_status?: string
          version_number?: number
          workspace_config?: Json
          zoom_classification?: string | null
          zoom_confidence?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analyses_parent_analysis_id_fkey"
            columns: ["parent_analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_jobs: {
        Row: {
          analysis_id: string
          analysis_pipeline_version: string
          athlete_id: string
          attempt_count: number
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          dead_lettered_at: string | null
          failed_at: string | null
          failure_category: string | null
          heartbeat_at: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_error_stage: string | null
          lease_expires_at: string | null
          manual_retry_allowed: boolean
          max_attempts: number
          next_attempt_at: string
          output_artifact_paths: Json
          priority: number
          session_id: string
          source_video_path: string
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
          user_action_required: boolean
          user_message: string | null
          worker_version: string | null
        }
        Insert: {
          analysis_id: string
          analysis_pipeline_version: string
          athlete_id: string
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          failed_at?: string | null
          failure_category?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_error_stage?: string | null
          lease_expires_at?: string | null
          manual_retry_allowed?: boolean
          max_attempts?: number
          next_attempt_at?: string
          output_artifact_paths?: Json
          priority?: number
          session_id: string
          source_video_path: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          updated_at?: string
          user_action_required?: boolean
          user_message?: string | null
          worker_version?: string | null
        }
        Update: {
          analysis_id?: string
          analysis_pipeline_version?: string
          athlete_id?: string
          attempt_count?: number
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          dead_lettered_at?: string | null
          failed_at?: string | null
          failure_category?: string | null
          heartbeat_at?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_error_stage?: string | null
          lease_expires_at?: string | null
          manual_retry_allowed?: boolean
          max_attempts?: number
          next_attempt_at?: string
          output_artifact_paths?: Json
          priority?: number
          session_id?: string
          source_video_path?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["analysis_job_status"]
          updated_at?: string
          user_action_required?: boolean
          user_message?: string | null
          worker_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_jobs_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analysis_jobs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          coach_id: string
          created_at: string
          date_of_birth: string | null
          full_name: string
          goal_100m: number | null
          goal_200m: number | null
          goal_60m: number | null
          height_cm: number | null
          id: string
          leg_length_cm: number | null
          personal_best_100m: number | null
          personal_best_200m: number | null
          personal_best_60m: number | null
          photo_url: string | null
          primary_event: string | null
          age_group: string | null
          sex: string | null
          trochanter_height_m: number | null
          weight_kg: number | null
        }
        Insert: {
          coach_id: string
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          goal_100m?: number | null
          goal_200m?: number | null
          goal_60m?: number | null
          height_cm?: number | null
          id?: string
          leg_length_cm?: number | null
          personal_best_100m?: number | null
          personal_best_200m?: number | null
          personal_best_60m?: number | null
          photo_url?: string | null
          primary_event?: string | null
          age_group?: string | null
          sex?: string | null
          trochanter_height_m?: number | null
          weight_kg?: number | null
        }
        Update: {
          coach_id?: string
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          goal_100m?: number | null
          goal_200m?: number | null
          goal_60m?: number | null
          height_cm?: number | null
          id?: string
          leg_length_cm?: number | null
          personal_best_100m?: number | null
          personal_best_200m?: number | null
          personal_best_60m?: number | null
          photo_url?: string | null
          primary_event?: string | null
          age_group?: string | null
          sex?: string | null
          trochanter_height_m?: number | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmarks: {
        Row: {
          analysis_type: Database["public"]["Enums"]["sprint_analysis_type"]
          created_at: string
          distance_m: number | null
          id: string
          kind: string | null
          name: string
          notes: string | null
          reference_metrics: Json
          source: string | null
          source_video_name: string | null
        }
        Insert: {
          analysis_type?: Database["public"]["Enums"]["sprint_analysis_type"]
          created_at?: string
          distance_m?: number | null
          id?: string
          kind?: string | null
          name: string
          notes?: string | null
          reference_metrics?: Json
          source?: string | null
          source_video_name?: string | null
        }
        Update: {
          analysis_type?: Database["public"]["Enums"]["sprint_analysis_type"]
          created_at?: string
          distance_m?: number | null
          id?: string
          kind?: string | null
          name?: string
          notes?: string | null
          reference_metrics?: Json
          source?: string | null
          source_video_name?: string | null
        }
        Relationships: []
      }
      coach_notes: {
        Row: {
          athlete_id: string
          author_id: string
          body: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["coach_note_kind"]
          pinned: boolean
          session_id: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          athlete_id: string
          author_id: string
          body: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["coach_note_kind"]
          pinned?: boolean
          session_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["coach_note_kind"]
          pinned?: boolean
          session_id?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      coach_note_revisions: {
        Row: { body: string; edited_at: string; editor_id: string; id: number; note_id: string; pinned: boolean; tags: string[] }
        Insert: { body: string; edited_at?: string; editor_id: string; id?: never; note_id: string; pinned: boolean; tags: string[] }
        Update: { body?: string; edited_at?: string; editor_id?: string; id?: never; note_id?: string; pinned?: boolean; tags?: string[] }
        Relationships: []
      }
      organizations: {
        Row: { created_at: string; created_by: string; id: string; name: string; updated_at: string }
        Insert: { created_at?: string; created_by: string; id?: string; name: string; updated_at?: string }
        Update: { created_at?: string; created_by?: string; id?: string; name?: string; updated_at?: string }
        Relationships: []
      }
      organization_memberships: {
        Row: { created_at: string; organization_id: string; role: Database["public"]["Enums"]["organization_role"]; user_id: string }
        Insert: { created_at?: string; organization_id: string; role: Database["public"]["Enums"]["organization_role"]; user_id: string }
        Update: { created_at?: string; organization_id?: string; role?: Database["public"]["Enums"]["organization_role"]; user_id?: string }
        Relationships: []
      }
      teams: {
        Row: { active: boolean; created_at: string; id: string; name: string; organization_id: string; season_label: string | null; updated_at: string }
        Insert: { active?: boolean; created_at?: string; id?: string; name: string; organization_id: string; season_label?: string | null; updated_at?: string }
        Update: { active?: boolean; created_at?: string; id?: string; name?: string; organization_id?: string; season_label?: string | null; updated_at?: string }
        Relationships: []
      }
      team_coaches: {
        Row: { coach_id: string; created_at: string; role: Database["public"]["Enums"]["organization_role"]; team_id: string }
        Insert: { coach_id: string; created_at?: string; role: Database["public"]["Enums"]["organization_role"]; team_id: string }
        Update: { coach_id?: string; created_at?: string; role?: Database["public"]["Enums"]["organization_role"]; team_id?: string }
        Relationships: []
      }
      team_athletes: {
        Row: { active: boolean; athlete_id: string; joined_at: string; team_id: string }
        Insert: { active?: boolean; athlete_id: string; joined_at?: string; team_id: string }
        Update: { active?: boolean; athlete_id?: string; joined_at?: string; team_id?: string }
        Relationships: []
      }
      coach_athlete_preferences: {
        Row: { athlete_id: string; coach_id: string; favorite: boolean; last_viewed_at: string | null; updated_at: string }
        Insert: { athlete_id: string; coach_id: string; favorite?: boolean; last_viewed_at?: string | null; updated_at?: string }
        Update: { athlete_id?: string; coach_id?: string; favorite?: boolean; last_viewed_at?: string | null; updated_at?: string }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      sessions: {
        Row: {
          analysis_type:
            | Database["public"]["Enums"]["sprint_analysis_type"]
            | null
          athlete_id: string
          benchmark_id: string | null
          calibration_gates: Json | null
          calibration_known_distance_m: number | null
          calibration_point_a_time_s: number | null
          calibration_point_ax: number | null
          calibration_point_ay: number | null
          calibration_point_b_time_s: number | null
          calibration_point_bx: number | null
          calibration_point_by: number | null
          calibration_zone_distance_m: number | null
          calibration_zone_end_s: number | null
          calibration_zone_start_s: number | null
          codec: string | null
          created_at: string
          created_by: string
          current_working_analysis_id: string | null
          distance_m: number | null
          duration_s: number | null
          fps: number | null
          fps_classification: string | null
          fps_metadata: Json | null
          fps_override: number | null
          height: number | null
          id: string
          name: string | null
          notes: string | null
          original_filename: string | null
          overlay_trochanter_time_s: number | null
          overlay_trochanter_x: number | null
          overlay_trochanter_y: number | null
          pose_engine: string
          recorded_at: string
          size_bytes: number | null
          status: Database["public"]["Enums"]["session_status"]
          timing_body_reference: string
          timing_direction: string
          timing_mode: string
          timing_setup: Json
          timing_splits: Json
          timing_workspace: Json
          timing_zone_schema_version: string | null
          timing_zone_version: number
          video_path: string | null
          width: number | null
        }
        Insert: {
          analysis_type?:
            | Database["public"]["Enums"]["sprint_analysis_type"]
            | null
          athlete_id: string
          benchmark_id?: string | null
          calibration_gates?: Json | null
          calibration_known_distance_m?: number | null
          calibration_point_a_time_s?: number | null
          calibration_point_ax?: number | null
          calibration_point_ay?: number | null
          calibration_point_b_time_s?: number | null
          calibration_point_bx?: number | null
          calibration_point_by?: number | null
          calibration_zone_distance_m?: number | null
          calibration_zone_end_s?: number | null
          calibration_zone_start_s?: number | null
          codec?: string | null
          created_at?: string
          created_by: string
          current_working_analysis_id?: string | null
          distance_m?: number | null
          duration_s?: number | null
          fps?: number | null
          fps_classification?: string | null
          fps_metadata?: Json | null
          fps_override?: number | null
          height?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          original_filename?: string | null
          overlay_trochanter_time_s?: number | null
          overlay_trochanter_x?: number | null
          overlay_trochanter_y?: number | null
          pose_engine?: string
          recorded_at?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["session_status"]
          timing_body_reference?: string
          timing_direction?: string
          timing_mode?: string
          timing_setup?: Json
          timing_splits?: Json
          timing_workspace?: Json
          timing_zone_schema_version?: string | null
          timing_zone_version?: number
          video_path?: string | null
          width?: number | null
        }
        Update: {
          analysis_type?:
            | Database["public"]["Enums"]["sprint_analysis_type"]
            | null
          athlete_id?: string
          benchmark_id?: string | null
          calibration_gates?: Json | null
          calibration_known_distance_m?: number | null
          calibration_point_a_time_s?: number | null
          calibration_point_ax?: number | null
          calibration_point_ay?: number | null
          calibration_point_b_time_s?: number | null
          calibration_point_bx?: number | null
          calibration_point_by?: number | null
          calibration_zone_distance_m?: number | null
          calibration_zone_end_s?: number | null
          calibration_zone_start_s?: number | null
          codec?: string | null
          created_at?: string
          created_by?: string
          current_working_analysis_id?: string | null
          distance_m?: number | null
          duration_s?: number | null
          fps?: number | null
          fps_classification?: string | null
          fps_metadata?: Json | null
          fps_override?: number | null
          height?: number | null
          id?: string
          name?: string | null
          notes?: string | null
          original_filename?: string | null
          overlay_trochanter_time_s?: number | null
          overlay_trochanter_x?: number | null
          overlay_trochanter_y?: number | null
          pose_engine?: string
          recorded_at?: string
          size_bytes?: number | null
          status?: Database["public"]["Enums"]["session_status"]
          timing_body_reference?: string
          timing_direction?: string
          timing_mode?: string
          timing_setup?: Json
          timing_splits?: Json
          timing_workspace?: Json
          timing_zone_schema_version?: string | null
          timing_zone_version?: number
          video_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_benchmark_id_fkey"
            columns: ["benchmark_id"]
            isOneToOne: false
            referencedRelation: "benchmarks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_current_working_analysis_fkey"
            columns: ["current_working_analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_consents: {
        Row: {
          accepted_at: string
          consent_type: string
          consent_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          consent_type: string
          consent_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          consent_version?: string
          user_id?: string
        }
        Relationships: []
      }
      validation_fixtures: {
        Row: {
          canonical_analysis_id: string | null
          created_at: string
          diagnostic_artifact_path: string | null
          expected_recording_class: string
          external_reference: Json
          fixture_id: string
          manual_annotation: Json | null
          name: string
          notes: Json
          protected_video_path: string
          schema_version: string
          session_id: string
          source_metadata: Json
          updated_at: string
          validation_status: string
        }
        Insert: {
          canonical_analysis_id?: string | null
          created_at?: string
          diagnostic_artifact_path?: string | null
          expected_recording_class: string
          external_reference: Json
          fixture_id: string
          manual_annotation?: Json | null
          name: string
          notes?: Json
          protected_video_path: string
          schema_version: string
          session_id: string
          source_metadata?: Json
          updated_at?: string
          validation_status: string
        }
        Update: {
          canonical_analysis_id?: string | null
          created_at?: string
          diagnostic_artifact_path?: string | null
          expected_recording_class?: string
          external_reference?: Json
          fixture_id?: string
          manual_annotation?: Json | null
          name?: string
          notes?: Json
          protected_video_path?: string
          schema_version?: string
          session_id?: string
          source_metadata?: Json
          updated_at?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "validation_fixtures_canonical_analysis_id_fkey"
            columns: ["canonical_analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "validation_fixtures_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_analysis_job: {
        Args: {
          p_job_id: string
        }
        Returns: boolean
      }
      claim_analysis_job: {
        Args: {
          p_worker_id: string
          p_worker_version: string
          p_lease_seconds?: number
        }
        Returns: {
          analysis_id: string
          analysis_pipeline_version: string
          athlete_id: string
          attempt_count: number
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          dead_lettered_at: string | null
          failed_at: string | null
          failure_category: string | null
          heartbeat_at: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_error_stage: string | null
          lease_expires_at: string | null
          manual_retry_allowed: boolean
          max_attempts: number
          next_attempt_at: string
          output_artifact_paths: Json
          priority: number
          session_id: string
          source_video_path: string
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
          user_action_required: boolean
          user_message: string | null
          worker_version: string | null
        }[]
      }
      complete_analysis_job: {
        Args: {
          p_job_id: string
          p_claim_token: string
          p_worker_id: string
          p_model_version: string
          p_metrics: Json
          p_provenance: Json
          p_input_snapshot: Json
          p_result_payload: Json
          p_keypoints_path: string
          p_source_fps: number
          p_artifact_paths: Json
        }
        Returns: boolean
      }
      complete_experimental_analysis_job: {
        Args: {
          p_job_id: string
          p_claim_token: string
          p_worker_id: string
          p_model_version: string
          p_metrics: Json
          p_provenance: Json
          p_input_snapshot: Json
          p_result_payload: Json
          p_keypoints_path: string
          p_source_fps: number
          p_artifact_paths: Json
          p_experimental_result: Json
        }
        Returns: boolean
      }
      fail_analysis_job: {
        Args: {
          p_job_id: string
          p_claim_token: string
          p_worker_id: string
          p_error_code: string
          p_error_message: string
          p_error_stage: string
          p_failure_category: string
          p_user_message: string
          p_retryable: boolean
          p_backoff_seconds: number
          p_user_action_required?: boolean
        }
        Returns: Database["public"]["Enums"]["analysis_job_status"]
      }
      get_analysis_job_status: {
        Args: {
          p_analysis_id: string
        }
        Returns: {
          status: Database["public"]["Enums"]["analysis_job_status"]
          user_message: string
          attempt_count: number
          updated_at: string
        }[]
      }
      get_research_workspace_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_research_source_detail: {
        Args: { p_source_id: string }
        Returns: Json
      }
      get_research_claim_detail: {
        Args: { p_claim_id: string }
        Returns: Json
      }
      review_research_claim: {
        Args: { p_claim_id: string; p_status: string; p_reason: string }
        Returns: boolean
      }
      retrieve_production_research_evidence: {
        Args: { p_metric_keys: string[]; p_usage: string; p_limit?: number }
        Returns: Json
      }
      get_benchmark_developer_catalog: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_projection_developer_summary: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_athlete_digital_twin_summary: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      activate_athlete_digital_twin_snapshot: {
        Args: { p_athlete_id: string; p_snapshot_id: string; p_reason: string }
        Returns: boolean
      }
      append_athlete_timeline_event: {
        Args: { p_athlete_id: string; p_event: Json }
        Returns: boolean
      }
      append_and_activate_athlete_digital_twin_snapshot: {
        Args: { p_athlete_id: string; p_snapshot: Json; p_reason: string }
        Returns: string
      }
      enqueue_coaching_state_invalidation: {
        Args: { p_athlete_id: string; p_trigger: Json }
        Returns: boolean
      }
      append_and_activate_coaching_state: {
        Args: { p_athlete_id: string; p_state: Json; p_triggers: Json }
        Returns: string
      }
      get_cached_coaching_state: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      heartbeat_analysis_job: {
        Args: {
          p_job_id: string
          p_claim_token: string
          p_worker_id: string
          p_lease_seconds?: number
        }
        Returns: boolean
      }
      replace_working_analysis: {
        Args: {
          p_session_id: string
          p_input_snapshot: Json
          p_analysis_fps: number
          p_pipeline_version: string
          p_metric_schema_version: string
          p_explainability_schema_version: string
          p_timing_compatibility_group: string
        }
        Returns: string
      }
      requeue_analysis_job: {
        Args: {
          p_job_id: string
        }
        Returns: boolean
      }
      reset_working_analysis: {
        Args: {
          p_session_id: string
        }
        Returns: boolean
      }
      save_working_analysis_snapshot: {
        Args: {
          p_session_id: string
          p_notes?: string
        }
        Returns: string
      }
      set_analysis_job_stage: {
        Args: {
          p_job_id: string
          p_claim_token: string
          p_worker_id: string
          p_status: Database["public"]["Enums"]["analysis_job_status"]
        }
        Returns: boolean
      }
    }
    Enums: {
      analysis_job_status:
        | "queued"
        | "claimed"
        | "downloading"
        | "validating"
        | "processing"
        | "generating_results"
        | "uploading_artifacts"
        | "completing"
        | "completed"
        | "retry_scheduled"
        | "failed"
        | "dead_lettered"
        | "cancelled"
      analysis_status: "queued" | "running" | "complete" | "failed"
      session_status:
        | "uploading"
        | "uploaded"
        | "queued"
        | "analyzing"
        | "complete"
        | "failed"
      sprint_analysis_type: "fly" | "acceleration"
      user_role: "coach" | "athlete" | "admin"
      organization_role: "owner" | "head_coach" | "assistant_coach" | "read_only_staff"
      coach_note_kind: "session" | "technique" | "training" | "competition"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          updated_at: string | null
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          updated_at?: string | null
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          bucket_id: string | null
          created_at: string | null
          id: string
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_insert_object: {
        Args: {
          bucketid: string
          name: string
          owner: string
          metadata: Json
        }
        Returns: undefined
      }
      extension: {
        Args: {
          name: string
        }
        Returns: string
      }
      filename: {
        Args: {
          name: string
        }
        Returns: string
      }
      foldername: {
        Args: {
          name: string
        }
        Returns: string[]
      }
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>
        Returns: {
          size: number
          bucket_id: string
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
        }
        Returns: {
          key: string
          id: string
          created_at: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          bucket_id: string
          prefix_param: string
          delimiter_param: string
          max_keys?: number
          start_after?: string
          next_token?: string
        }
        Returns: {
          name: string
          id: string
          metadata: Json
          updated_at: string
        }[]
      }
      operation: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      search: {
        Args: {
          prefix: string
          bucketname: string
          limits?: number
          levels?: number
          offsets?: number
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          name: string
          id: string
          updated_at: string
          created_at: string
          last_accessed_at: string
          metadata: Json
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
