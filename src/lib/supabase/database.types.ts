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
      active_coaching_states: {
        Row: {
          athlete_id: string
          state_snapshot_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          athlete_id: string
          state_snapshot_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          athlete_id?: string
          state_snapshot_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_coaching_states_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_coaching_states_state_snapshot_id_fkey"
            columns: ["state_snapshot_id"]
            isOneToOne: false
            referencedRelation: "coaching_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      active_intelligence_pipelines: {
        Row: {
          athlete_id: string
          pipeline_snapshot_id: string
          updated_at: string
        }
        Insert: {
          athlete_id: string
          pipeline_snapshot_id: string
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          pipeline_snapshot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_intelligence_pipelines_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_intelligence_pipelines_pipeline_snapshot_id_fkey"
            columns: ["pipeline_snapshot_id"]
            isOneToOne: false
            referencedRelation: "intelligence_pipeline_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      active_performance_optimizations: {
        Row: {
          athlete_id: string
          snapshot_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          athlete_id: string
          snapshot_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          athlete_id?: string
          snapshot_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_performance_optimizations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_performance_optimizations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "performance_optimization_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      active_root_cause_recommendation_contexts: {
        Row: {
          athlete_id: string
          snapshot_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          athlete_id: string
          snapshot_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          athlete_id?: string
          snapshot_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_root_cause_recommendation_contexts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_root_cause_recommendation_contexts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "root_cause_recommendation_context_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      active_root_cause_states: {
        Row: {
          athlete_id: string
          snapshot_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          athlete_id: string
          snapshot_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          athlete_id?: string
          snapshot_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_root_cause_states_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_root_cause_states_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "root_cause_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
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
          progress: Json | null
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
          progress?: Json | null
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
          progress?: Json | null
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
      athlete_digital_twin_audit: {
        Row: {
          action: string
          actor_id: string
          athlete_id: string
          created_at: string
          id: string
          previous_snapshot_id: string | null
          reason: string
          selected_snapshot_id: string
        }
        Insert: {
          action: string
          actor_id: string
          athlete_id: string
          created_at?: string
          id?: string
          previous_snapshot_id?: string | null
          reason: string
          selected_snapshot_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          athlete_id?: string
          created_at?: string
          id?: string
          previous_snapshot_id?: string | null
          reason?: string
          selected_snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_digital_twin_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_digital_twin_audit_previous_snapshot_id_fkey"
            columns: ["previous_snapshot_id"]
            isOneToOne: false
            referencedRelation: "athlete_digital_twin_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_digital_twin_audit_selected_snapshot_id_fkey"
            columns: ["selected_snapshot_id"]
            isOneToOne: false
            referencedRelation: "athlete_digital_twin_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_digital_twin_snapshots: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          engine_version: string
          id: string
          previous_snapshot_id: string | null
          reason: string
          schema_version: string
          snapshot_id: string
          snapshot_version: string
          source_event_count: number
          twin_id: string
          twin_snapshot: Json
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by: string
          engine_version: string
          id?: string
          previous_snapshot_id?: string | null
          reason: string
          schema_version: string
          snapshot_id: string
          snapshot_version: string
          source_event_count: number
          twin_id: string
          twin_snapshot: Json
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          previous_snapshot_id?: string | null
          reason?: string
          schema_version?: string
          snapshot_id?: string
          snapshot_version?: string
          source_event_count?: number
          twin_id?: string
          twin_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "athlete_digital_twin_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_digital_twin_snapshots_previous_snapshot_id_fkey"
            columns: ["previous_snapshot_id"]
            isOneToOne: false
            referencedRelation: "athlete_digital_twin_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_digital_twin_state: {
        Row: {
          active_snapshot_id: string
          athlete_id: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          active_snapshot_id: string
          athlete_id: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          active_snapshot_id?: string
          athlete_id?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_digital_twin_state_active_snapshot_id_fkey"
            columns: ["active_snapshot_id"]
            isOneToOne: false
            referencedRelation: "athlete_digital_twin_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athlete_digital_twin_state_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: true
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athlete_timeline_events: {
        Row: {
          athlete_id: string
          compatibility_key: string | null
          confidence: number
          created_at: string
          created_by: string
          event_id: string
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          recorded_at: string
          source_version: string
        }
        Insert: {
          athlete_id: string
          compatibility_key?: string | null
          confidence: number
          created_at?: string
          created_by: string
          event_id: string
          event_type: string
          id?: string
          occurred_at: string
          payload: Json
          recorded_at: string
          source_version: string
        }
        Update: {
          athlete_id?: string
          compatibility_key?: string | null
          confidence?: number
          created_at?: string
          created_by?: string
          event_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          recorded_at?: string
          source_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "athlete_timeline_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      athletes: {
        Row: {
          age_group: string | null
          coach_id: string
          competition_level: string | null
          created_at: string
          date_of_birth: string | null
          dominant_leg: string | null
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
          sex: string | null
          spikes_used: string | null
          surface: string | null
          trochanter_height_m: number | null
          user_id: string | null
          weight_kg: number | null
          wingspan_cm: number | null
        }
        Insert: {
          age_group?: string | null
          coach_id: string
          competition_level?: string | null
          created_at?: string
          date_of_birth?: string | null
          dominant_leg?: string | null
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
          sex?: string | null
          spikes_used?: string | null
          surface?: string | null
          trochanter_height_m?: number | null
          user_id?: string | null
          weight_kg?: number | null
          wingspan_cm?: number | null
        }
        Update: {
          age_group?: string | null
          coach_id?: string
          competition_level?: string | null
          created_at?: string
          date_of_birth?: string | null
          dominant_leg?: string | null
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
          sex?: string | null
          spikes_used?: string | null
          surface?: string | null
          trochanter_height_m?: number | null
          user_id?: string | null
          weight_kg?: number | null
          wingspan_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "athletes_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "athletes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_dataset_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          dataset_id: string
          details: Json
          id: string
          reason: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          dataset_id: string
          details?: Json
          id?: string
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          dataset_id?: string
          details?: Json
          id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_dataset_audit_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "benchmark_population_datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_population_datasets: {
        Row: {
          active: boolean
          archived_at: string | null
          comparison_level: string
          contract: Json
          created_at: string
          created_by: string
          dataset_key: string
          dataset_name: string
          dataset_version: string
          id: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          schema_version: string
          source_ids: string[]
          updated_at: string
          verified: boolean
        }
        Insert: {
          active?: boolean
          archived_at?: string | null
          comparison_level: string
          contract: Json
          created_at?: string
          created_by: string
          dataset_key: string
          dataset_name: string
          dataset_version: string
          id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version: string
          source_ids: string[]
          updated_at?: string
          verified?: boolean
        }
        Update: {
          active?: boolean
          archived_at?: string | null
          comparison_level?: string
          contract?: Json
          created_at?: string
          created_by?: string
          dataset_key?: string
          dataset_name?: string
          dataset_version?: string
          id?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          schema_version?: string
          source_ids?: string[]
          updated_at?: string
          verified?: boolean
        }
        Relationships: []
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
      beta_audit_events: {
        Row: {
          action: string
          actor_user_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_user_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      coach_athlete_preferences: {
        Row: {
          athlete_id: string
          coach_id: string
          favorite: boolean
          last_viewed_at: string | null
          updated_at: string
        }
        Insert: {
          athlete_id: string
          coach_id: string
          favorite?: boolean
          last_viewed_at?: string | null
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          coach_id?: string
          favorite?: boolean
          last_viewed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_athlete_preferences_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_athlete_preferences_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_note_revisions: {
        Row: {
          body: string
          edited_at: string
          editor_id: string
          id: number
          note_id: string
          pinned: boolean
          tags: string[]
        }
        Insert: {
          body: string
          edited_at?: string
          editor_id: string
          id?: never
          note_id: string
          pinned: boolean
          tags: string[]
        }
        Update: {
          body?: string
          edited_at?: string
          editor_id?: string
          id?: never
          note_id?: string
          pinned?: boolean
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "coach_note_revisions_editor_id_fkey"
            columns: ["editor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_note_revisions_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "coach_notes"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "coach_notes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_notes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_state_audit: {
        Row: {
          action: string
          actor_id: string
          athlete_id: string
          created_at: string
          id: string
          input_fingerprint: string
          previous_state_id: string | null
          selected_state_id: string
        }
        Insert: {
          action: string
          actor_id: string
          athlete_id: string
          created_at?: string
          id?: string
          input_fingerprint: string
          previous_state_id?: string | null
          selected_state_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          athlete_id?: string
          created_at?: string
          id?: string
          input_fingerprint?: string
          previous_state_id?: string | null
          selected_state_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_state_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_state_audit_previous_state_id_fkey"
            columns: ["previous_state_id"]
            isOneToOne: false
            referencedRelation: "coaching_state_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_state_audit_selected_state_id_fkey"
            columns: ["selected_state_id"]
            isOneToOne: false
            referencedRelation: "coaching_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_state_invalidations: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          id: string
          occurred_at: string
          processed_at: string | null
          processed_state_id: string | null
          source_id: string
          status: string
          trigger_id: string
          trigger_type: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by: string
          id?: string
          occurred_at: string
          processed_at?: string | null
          processed_state_id?: string | null
          source_id: string
          status?: string
          trigger_id: string
          trigger_type: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_at?: string
          processed_at?: string | null
          processed_state_id?: string | null
          source_id?: string
          status?: string
          trigger_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_state_invalidations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_state_invalidations_processed_state_id_fkey"
            columns: ["processed_state_id"]
            isOneToOne: false
            referencedRelation: "coaching_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      coaching_state_snapshots: {
        Row: {
          athlete_id: string
          coaching_state_id: string
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input_fingerprint: string
          schema_version: string
          state_snapshot: Json
          twin_updated_at: string
        }
        Insert: {
          athlete_id: string
          coaching_state_id: string
          created_at: string
          created_by: string
          engine_version: string
          id?: string
          input_fingerprint: string
          schema_version: string
          state_snapshot: Json
          twin_updated_at: string
        }
        Update: {
          athlete_id?: string
          coaching_state_id?: string
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input_fingerprint?: string
          schema_version?: string
          state_snapshot?: Json
          twin_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_state_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_submissions: {
        Row: {
          analysis_id: string | null
          category: string
          comment: string | null
          created_at: string
          current_route: string | null
          id: string
          may_contact: boolean
          session_id: string | null
          usefulness: string | null
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          category: string
          comment?: string | null
          created_at?: string
          current_route?: string | null
          id?: string
          may_contact?: boolean
          session_id?: string | null
          usefulness?: string | null
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          category?: string
          comment?: string | null
          created_at?: string
          current_route?: string | null
          id?: string
          may_contact?: boolean
          session_id?: string | null
          usefulness?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_submissions_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_submissions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_cutover_evaluations: {
        Row: {
          created_at: string
          evaluated_at: string
          gates: Json
          id: string
          ready: boolean
        }
        Insert: {
          created_at?: string
          evaluated_at: string
          gates: Json
          id?: string
          ready: boolean
        }
        Update: {
          created_at?: string
          evaluated_at?: string
          gates?: Json
          id?: string
          ready?: boolean
        }
        Relationships: []
      }
      intelligence_dead_letters: {
        Row: {
          adapter_version: string
          athlete_id: string
          attempts: number
          created_at: string
          dependency_states: Json
          engine_id: string
          engine_version: string
          execution_job_id: string
          execution_plan_id: string
          failed_stage: string
          failure_classification: string
          first_failure_at: string
          id: string
          internal_note: string | null
          recommended_action: string
          replay_eligibility: string
          replay_reason: string
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          staged_snapshots_exist: boolean
          terminal_failure_at: string
        }
        Insert: {
          adapter_version: string
          athlete_id: string
          attempts: number
          created_at?: string
          dependency_states: Json
          engine_id: string
          engine_version: string
          execution_job_id: string
          execution_plan_id: string
          failed_stage: string
          failure_classification: string
          first_failure_at: string
          id?: string
          internal_note?: string | null
          recommended_action: string
          replay_eligibility: string
          replay_reason: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staged_snapshots_exist: boolean
          terminal_failure_at: string
        }
        Update: {
          adapter_version?: string
          athlete_id?: string
          attempts?: number
          created_at?: string
          dependency_states?: Json
          engine_id?: string
          engine_version?: string
          execution_job_id?: string
          execution_plan_id?: string
          failed_stage?: string
          failure_classification?: string
          first_failure_at?: string
          id?: string
          internal_note?: string | null
          recommended_action?: string
          replay_eligibility?: string
          replay_reason?: string
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staged_snapshots_exist?: boolean
          terminal_failure_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_dead_letters_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_dead_letters_execution_job_id_fkey"
            columns: ["execution_job_id"]
            isOneToOne: true
            referencedRelation: "intelligence_execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_dead_letters_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_dead_letters_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_execution_jobs: {
        Row: {
          athlete_id: string
          attempt_count: number
          available_at: string
          cache_hit: boolean | null
          claim_token: string | null
          claimed_by: string | null
          created_at: string
          dependencies: Json
          engine_id: string
          engine_version: string
          execution_plan_id: string
          failure_code: string | null
          failure_kind: string | null
          failure_message: string | null
          finished_at: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          snapshot_id: string | null
          started_at: string | null
          state: Database["public"]["Enums"]["intelligence_execution_state"]
          updated_at: string
        }
        Insert: {
          athlete_id: string
          attempt_count?: number
          available_at?: string
          cache_hit?: boolean | null
          claim_token?: string | null
          claimed_by?: string | null
          created_at?: string
          dependencies?: Json
          engine_id: string
          engine_version: string
          execution_plan_id: string
          failure_code?: string | null
          failure_kind?: string | null
          failure_message?: string | null
          finished_at?: string | null
          id?: string
          lease_expires_at?: string | null
          max_attempts?: number
          snapshot_id?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["intelligence_execution_state"]
          updated_at?: string
        }
        Update: {
          athlete_id?: string
          attempt_count?: number
          available_at?: string
          cache_hit?: boolean | null
          claim_token?: string | null
          claimed_by?: string | null
          created_at?: string
          dependencies?: Json
          engine_id?: string
          engine_version?: string
          execution_plan_id?: string
          failure_code?: string | null
          failure_kind?: string | null
          failure_message?: string | null
          finished_at?: string | null
          id?: string
          lease_expires_at?: string | null
          max_attempts?: number
          snapshot_id?: string | null
          started_at?: string | null
          state?: Database["public"]["Enums"]["intelligence_execution_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_execution_jobs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_execution_jobs_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_execution_plans: {
        Row: {
          analysis_id: string
          athlete_id: string
          completed_at: string | null
          created_at: string
          dependency_graph: Json
          engine_versions: Json
          execution_order: Json
          failure: Json | null
          id: string
          input_fingerprint: string
          orchestration_version: string
          pipeline_version: string
          progress_percent: number
          registry_version: string
          request_idempotency_key: string | null
          request_metadata: Json
          shadow_execution: boolean
          snapshot_targets: Json
          started_at: string | null
          state: Database["public"]["Enums"]["intelligence_execution_state"]
        }
        Insert: {
          analysis_id: string
          athlete_id: string
          completed_at?: string | null
          created_at?: string
          dependency_graph: Json
          engine_versions: Json
          execution_order: Json
          failure?: Json | null
          id?: string
          input_fingerprint: string
          orchestration_version: string
          pipeline_version: string
          progress_percent?: number
          registry_version?: string
          request_idempotency_key?: string | null
          request_metadata?: Json
          shadow_execution?: boolean
          snapshot_targets: Json
          started_at?: string | null
          state?: Database["public"]["Enums"]["intelligence_execution_state"]
        }
        Update: {
          analysis_id?: string
          athlete_id?: string
          completed_at?: string | null
          created_at?: string
          dependency_graph?: Json
          engine_versions?: Json
          execution_order?: Json
          failure?: Json | null
          id?: string
          input_fingerprint?: string
          orchestration_version?: string
          pipeline_version?: string
          progress_percent?: number
          registry_version?: string
          request_idempotency_key?: string | null
          request_metadata?: Json
          shadow_execution?: boolean
          snapshot_targets?: Json
          started_at?: string | null
          state?: Database["public"]["Enums"]["intelligence_execution_state"]
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_execution_plans_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_execution_plans_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_execution_traces: {
        Row: {
          athlete_id: string
          cache_hit: boolean
          duration_ms: number
          engine_id: string
          engine_version: string
          execution_job_id: string
          execution_plan_id: string
          failure_reason: Json | null
          finished_at: string
          id: string
          input_fingerprint: string
          input_reference: Json
          output_fingerprint: string | null
          output_reference: Json
          retry_count: number
          started_at: string
        }
        Insert: {
          athlete_id: string
          cache_hit: boolean
          duration_ms: number
          engine_id: string
          engine_version: string
          execution_job_id: string
          execution_plan_id: string
          failure_reason?: Json | null
          finished_at: string
          id?: string
          input_fingerprint: string
          input_reference?: Json
          output_fingerprint?: string | null
          output_reference?: Json
          retry_count?: number
          started_at: string
        }
        Update: {
          athlete_id?: string
          cache_hit?: boolean
          duration_ms?: number
          engine_id?: string
          engine_version?: string
          execution_job_id?: string
          execution_plan_id?: string
          failure_reason?: Json | null
          finished_at?: string
          id?: string
          input_fingerprint?: string
          input_reference?: Json
          output_fingerprint?: string | null
          output_reference?: Json
          retry_count?: number
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_execution_traces_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_execution_traces_execution_job_id_fkey"
            columns: ["execution_job_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_execution_traces_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_health_evaluations: {
        Row: {
          evaluated_at: string
          id: string
          metrics: Json
          reasons: Json
          scope_id: string
          state: string
          thresholds: Json
        }
        Insert: {
          evaluated_at?: string
          id?: string
          metrics: Json
          reasons: Json
          scope_id: string
          state: string
          thresholds: Json
        }
        Update: {
          evaluated_at?: string
          id?: string
          metrics?: Json
          reasons?: Json
          scope_id?: string
          state?: string
          thresholds?: Json
        }
        Relationships: []
      }
      intelligence_orchestration_audit: {
        Row: {
          action: string
          actor_id: string
          actor_type: string
          athlete_id: string
          created_at: string
          details: Json
          execution_plan_id: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_type: string
          athlete_id: string
          created_at?: string
          details?: Json
          execution_plan_id?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_type?: string
          athlete_id?: string
          created_at?: string
          details?: Json
          execution_plan_id?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_orchestration_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_orchestration_audit_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_orchestration_invalidations: {
        Row: {
          athlete_id: string
          created_at: string
          id: string
          invalidated_engine_ids: Json
          processed_at: string | null
          source_engine_id: string | null
          source_reference: Json
          trigger: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          id?: string
          invalidated_engine_ids: Json
          processed_at?: string | null
          source_engine_id?: string | null
          source_reference?: Json
          trigger: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          id?: string
          invalidated_engine_ids?: Json
          processed_at?: string | null
          source_engine_id?: string | null
          source_reference?: Json
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_orchestration_invalidations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_pipeline_snapshots: {
        Row: {
          activated_at: string | null
          activation_status: string
          adapter_versions: Json
          analysis_id: string
          athlete_id: string
          created_at: string
          engine_versions: Json
          execution_plan_id: string
          id: string
          input_fingerprint: string
          input_provenance: Json
          integrity_fingerprint: string | null
          pipeline_version: string
          previous_pipeline_snapshot_id: string | null
          registry_version: string
          rollback_metadata: Json | null
          rolled_back_at: string | null
          snapshot_ids: Json
        }
        Insert: {
          activated_at?: string | null
          activation_status?: string
          adapter_versions?: Json
          analysis_id: string
          athlete_id: string
          created_at?: string
          engine_versions: Json
          execution_plan_id: string
          id?: string
          input_fingerprint: string
          input_provenance?: Json
          integrity_fingerprint?: string | null
          pipeline_version: string
          previous_pipeline_snapshot_id?: string | null
          registry_version?: string
          rollback_metadata?: Json | null
          rolled_back_at?: string | null
          snapshot_ids: Json
        }
        Update: {
          activated_at?: string | null
          activation_status?: string
          adapter_versions?: Json
          analysis_id?: string
          athlete_id?: string
          created_at?: string
          engine_versions?: Json
          execution_plan_id?: string
          id?: string
          input_fingerprint?: string
          input_provenance?: Json
          integrity_fingerprint?: string | null
          pipeline_version?: string
          previous_pipeline_snapshot_id?: string | null
          registry_version?: string
          rollback_metadata?: Json | null
          rolled_back_at?: string | null
          snapshot_ids?: Json
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_pipeline_snapsho_previous_pipeline_snapshot_i_fkey"
            columns: ["previous_pipeline_snapshot_id"]
            isOneToOne: false
            referencedRelation: "intelligence_pipeline_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_pipeline_snapshots_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_pipeline_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_pipeline_snapshots_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: true
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_progress_events: {
        Row: {
          athlete_id: string
          created_at: string
          current_engine_id: string | null
          execution_plan_id: string
          id: number
          progress_percent: number
          remaining_engine_ids: Json
        }
        Insert: {
          athlete_id: string
          created_at?: string
          current_engine_id?: string | null
          execution_plan_id: string
          id?: never
          progress_percent: number
          remaining_engine_ids?: Json
        }
        Update: {
          athlete_id?: string
          created_at?: string
          current_engine_id?: string | null
          execution_plan_id?: string
          id?: never
          progress_percent?: number
          remaining_engine_ids?: Json
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_progress_events_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_progress_events_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_replay_runs: {
        Row: {
          athlete_id: string
          authoritative: boolean
          cache_mode: string
          completed_at: string | null
          created_at: string
          id: string
          reason: string
          replay_execution_plan_id: string | null
          source_execution_plan_id: string
          state: string
          target_engine_ids: Json
          version_availability: Json
        }
        Insert: {
          athlete_id: string
          authoritative?: boolean
          cache_mode: string
          completed_at?: string | null
          created_at?: string
          id: string
          reason: string
          replay_execution_plan_id?: string | null
          source_execution_plan_id: string
          state?: string
          target_engine_ids: Json
          version_availability: Json
        }
        Update: {
          athlete_id?: string
          authoritative?: boolean
          cache_mode?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          reason?: string
          replay_execution_plan_id?: string | null
          source_execution_plan_id?: string
          state?: string
          target_engine_ids?: Json
          version_availability?: Json
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_replay_runs_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_replay_runs_replay_execution_plan_id_fkey"
            columns: ["replay_execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_replay_runs_source_execution_plan_id_fkey"
            columns: ["source_execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_retry_history: {
        Row: {
          athlete_id: string
          attempt_number: number
          created_at: string
          delay_ms: number
          execution_job_id: string
          failure_code: string
          failure_kind: string
          id: string
        }
        Insert: {
          athlete_id: string
          attempt_number: number
          created_at?: string
          delay_ms: number
          execution_job_id: string
          failure_code: string
          failure_kind: string
          id?: string
        }
        Update: {
          athlete_id?: string
          attempt_number?: number
          created_at?: string
          delay_ms?: number
          execution_job_id?: string
          failure_code?: string
          failure_kind?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_retry_history_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_retry_history_execution_job_id_fkey"
            columns: ["execution_job_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_shadow_comparisons: {
        Row: {
          athlete_id: string
          baseline_mode: string
          blocker_reasons: Json
          completed_at: string
          created_at: string
          execution_plan_fingerprint: string
          execution_plan_id: string
          id: string
          per_engine_results: Json
          readiness: string
          report_version: string
          shadow_manifest_id: string
          started_at: string
          summary: Json
        }
        Insert: {
          athlete_id: string
          baseline_mode: string
          blocker_reasons?: Json
          completed_at: string
          created_at?: string
          execution_plan_fingerprint: string
          execution_plan_id: string
          id?: string
          per_engine_results: Json
          readiness: string
          report_version: string
          shadow_manifest_id: string
          started_at: string
          summary: Json
        }
        Update: {
          athlete_id?: string
          baseline_mode?: string
          blocker_reasons?: Json
          completed_at?: string
          created_at?: string
          execution_plan_fingerprint?: string
          execution_plan_id?: string
          id?: string
          per_engine_results?: Json
          readiness?: string
          report_version?: string
          shadow_manifest_id?: string
          started_at?: string
          summary?: Json
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_shadow_comparisons_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_shadow_comparisons_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_shadow_comparisons_shadow_manifest_id_fkey"
            columns: ["shadow_manifest_id"]
            isOneToOne: true
            referencedRelation: "intelligence_shadow_manifests"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_shadow_manifests: {
        Row: {
          adapter_versions: Json
          analysis_id: string
          athlete_id: string
          authoritative: boolean
          created_at: string
          engine_versions: Json
          execution_plan_id: string
          id: string
          input_fingerprint: string
          input_provenance: Json
          integrity_fingerprint: string
          pipeline_version: string
          registry_version: string
          snapshot_references: Json
          source_replay_run_id: string | null
          status: string
        }
        Insert: {
          adapter_versions: Json
          analysis_id: string
          athlete_id: string
          authoritative?: boolean
          created_at?: string
          engine_versions: Json
          execution_plan_id: string
          id?: string
          input_fingerprint: string
          input_provenance?: Json
          integrity_fingerprint: string
          pipeline_version: string
          registry_version: string
          snapshot_references: Json
          source_replay_run_id?: string | null
          status?: string
        }
        Update: {
          adapter_versions?: Json
          analysis_id?: string
          athlete_id?: string
          authoritative?: boolean
          created_at?: string
          engine_versions?: Json
          execution_plan_id?: string
          id?: string
          input_fingerprint?: string
          input_provenance?: Json
          integrity_fingerprint?: string
          pipeline_version?: string
          registry_version?: string
          snapshot_references?: Json
          source_replay_run_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_shadow_manifests_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_shadow_manifests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_shadow_manifests_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: true
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      intelligence_staged_snapshots: {
        Row: {
          adapter_version: string
          athlete_id: string
          created_at: string
          engine_id: string
          engine_version: string
          execution_job_id: string
          execution_plan_id: string
          id: string
          output_contract: string
          output_fingerprint: string
          payload: Json | null
          snapshot_id: string
        }
        Insert: {
          adapter_version: string
          athlete_id: string
          created_at?: string
          engine_id: string
          engine_version: string
          execution_job_id: string
          execution_plan_id: string
          id?: string
          output_contract: string
          output_fingerprint: string
          payload?: Json | null
          snapshot_id: string
        }
        Update: {
          adapter_version?: string
          athlete_id?: string
          created_at?: string
          engine_id?: string
          engine_version?: string
          execution_job_id?: string
          execution_plan_id?: string
          id?: string
          output_contract?: string
          output_fingerprint?: string
          payload?: Json | null
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligence_staged_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_staged_snapshots_execution_job_id_fkey"
            columns: ["execution_job_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "intelligence_staged_snapshots_execution_plan_id_fkey"
            columns: ["execution_plan_id"]
            isOneToOne: false
            referencedRelation: "intelligence_execution_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_analysis_requests: {
        Row: {
          analysis_id: string
          athlete_id: string
          created_at: string
          id: string
          idempotency_key: string
          request_id: string
          upload_id: string
          user_id: string
        }
        Insert: {
          analysis_id: string
          athlete_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          request_id: string
          upload_id: string
          user_id: string
        }
        Update: {
          analysis_id?: string
          athlete_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          request_id?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_analysis_requests_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_analysis_requests_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_analysis_requests_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: true
            referencedRelation: "mobile_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_analysis_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_deletion_audit: {
        Row: {
          analysis_id: string | null
          athlete_id: string
          completed_at: string | null
          id: string
          request_id: string
          requested_at: string
          status: string
          upload_id: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          athlete_id: string
          completed_at?: string | null
          id?: string
          request_id: string
          requested_at?: string
          status: string
          upload_id: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          athlete_id?: string
          completed_at?: string | null
          id?: string
          request_id?: string
          requested_at?: string
          status?: string
          upload_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_deletion_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_deletion_audit_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mobile_uploads: {
        Row: {
          actual_bytes: number | null
          analysis_id: string | null
          athlete_id: string
          client_sha256: string
          completed_at: string | null
          content_type: string
          created_at: string
          deleted_at: string | null
          deletion_requested_at: string | null
          expected_bytes: number
          expires_at: string
          id: string
          idempotency_key: string
          object_path: string
          original_filename: string
          recording_metadata: Json
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actual_bytes?: number | null
          analysis_id?: string | null
          athlete_id: string
          client_sha256: string
          completed_at?: string | null
          content_type: string
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          expected_bytes: number
          expires_at: string
          id?: string
          idempotency_key: string
          object_path: string
          original_filename: string
          recording_metadata: Json
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actual_bytes?: number | null
          analysis_id?: string | null
          athlete_id?: string
          client_sha256?: string
          completed_at?: string | null
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          deletion_requested_at?: string | null
          expected_bytes?: number
          expires_at?: string
          id?: string
          idempotency_key?: string
          object_path?: string
          original_filename?: string
          recording_metadata?: Json
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mobile_uploads_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: true
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_uploads_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mobile_uploads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_states: {
        Row: {
          completed_at: string | null
          current_step: number
          onboarding_version: string
          scientific_boundary_acknowledged: boolean
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          onboarding_version: string
          scientific_boundary_acknowledged?: boolean
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          onboarding_version?: string
          scientific_boundary_acknowledged?: boolean
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_memberships: {
        Row: {
          created_at: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["organization_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["organization_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_optimization_audit: {
        Row: {
          action: string
          actor_id: string
          athlete_id: string
          created_at: string
          id: string
          input_fingerprint: string
          selected_snapshot_id: string
        }
        Insert: {
          action: string
          actor_id: string
          athlete_id: string
          created_at?: string
          id?: string
          input_fingerprint: string
          selected_snapshot_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          athlete_id?: string
          created_at?: string
          id?: string
          input_fingerprint?: string
          selected_snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_optimization_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_optimization_audit_selected_snapshot_id_fkey"
            columns: ["selected_snapshot_id"]
            isOneToOne: false
            referencedRelation: "performance_optimization_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_optimization_invalidations: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          id: string
          occurred_at: string
          processed_at: string | null
          processed_snapshot_id: string | null
          source_id: string
          status: string
          trigger_id: string
          trigger_type: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by: string
          id?: string
          occurred_at: string
          processed_at?: string | null
          processed_snapshot_id?: string | null
          source_id: string
          status?: string
          trigger_id: string
          trigger_type: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_at?: string
          processed_at?: string | null
          processed_snapshot_id?: string | null
          source_id?: string
          status?: string
          trigger_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_optimization_invalidatio_processed_snapshot_id_fkey"
            columns: ["processed_snapshot_id"]
            isOneToOne: false
            referencedRelation: "performance_optimization_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_optimization_invalidations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_optimization_snapshots: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input_fingerprint: string
          optimization_id: string
          optimization_version: string
          state_snapshot: Json
          twin_updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at: string
          created_by: string
          engine_version: string
          id?: string
          input_fingerprint: string
          optimization_id: string
          optimization_version: string
          state_snapshot: Json
          twin_updated_at: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input_fingerprint?: string
          optimization_id?: string
          optimization_version?: string
          state_snapshot?: Json
          twin_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_optimization_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_projection_snapshots: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input_snapshot: Json
          output_snapshot: Json
          projection_id: string
          projection_type: string
          schema_version: string
          target_metric: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by: string
          engine_version: string
          id?: string
          input_snapshot: Json
          output_snapshot: Json
          projection_id: string
          projection_type: string
          schema_version: string
          target_metric: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input_snapshot?: Json
          output_snapshot?: Json
          projection_id?: string
          projection_type?: string
          schema_version?: string
          target_metric?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_projection_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
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
      research_audit_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json
          entity_id: string
          entity_type: string
          from_status: string | null
          id: string
          reason: string
          to_status: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: string
          reason: string
          to_status?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: string
          reason?: string
          to_status?: string | null
        }
        Relationships: []
      }
      research_claims: {
        Row: {
          applicability: string
          archived_at: string | null
          athlete_facing_eligible: boolean
          category: string
          claim_key: string
          claim_type: string
          coach_facing_eligible: boolean
          consensus_status: string
          created_at: string
          created_by: string
          evidence_grade: string
          evidence_grade_reasons: Json
          excluded_conclusions: Json
          id: string
          limitations: Json
          normalized_statement: string
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          scope: Json
          statement: string
          updated_at: string
          version: number
        }
        Insert: {
          applicability?: string
          archived_at?: string | null
          athlete_facing_eligible?: boolean
          category: string
          claim_key: string
          claim_type: string
          coach_facing_eligible?: boolean
          consensus_status?: string
          created_at?: string
          created_by: string
          evidence_grade?: string
          evidence_grade_reasons?: Json
          excluded_conclusions?: Json
          id?: string
          limitations?: Json
          normalized_statement: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: Json
          statement: string
          updated_at?: string
          version?: number
        }
        Update: {
          applicability?: string
          archived_at?: string | null
          athlete_facing_eligible?: boolean
          category?: string
          claim_key?: string
          claim_type?: string
          coach_facing_eligible?: boolean
          consensus_status?: string
          created_at?: string
          created_by?: string
          evidence_grade?: string
          evidence_grade_reasons?: Json
          excluded_conclusions?: Json
          id?: string
          limitations?: Json
          normalized_statement?: string
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          scope?: Json
          statement?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      research_evidence_links: {
        Row: {
          applicability: Json
          claim_id: string
          created_at: string
          directness: string
          extraction: Json
          id: string
          limitations: Json
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          reviewer_status: string
          source_id: string
          statistics: Json
          support_type: string
          version: number
        }
        Insert: {
          applicability?: Json
          claim_id: string
          created_at?: string
          directness: string
          extraction?: Json
          id?: string
          limitations?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          reviewer_status?: string
          source_id: string
          statistics?: Json
          support_type: string
          version?: number
        }
        Update: {
          applicability?: Json
          claim_id?: string
          created_at?: string
          directness?: string
          extraction?: Json
          id?: string
          limitations?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          reviewer_status?: string
          source_id?: string
          statistics?: Json
          support_type?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "research_evidence_links_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "research_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_evidence_links_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      research_metric_definitions: {
        Row: {
          created_at: string
          created_by: string
          definition: Json
          metric_key: string
          review_status: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          definition: Json
          metric_key: string
          review_status?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          definition?: Json
          metric_key?: string
          review_status?: string
          version?: number
        }
        Relationships: []
      }
      research_reviewers: {
        Row: {
          active: boolean
          appointed_at: string
          appointed_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          appointed_at?: string
          appointed_by?: string | null
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          appointed_at?: string
          appointed_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      research_sources: {
        Row: {
          access_status: string
          archived_at: string | null
          correction_notice: string | null
          created_at: string
          created_by: string
          document_hash: string | null
          doi: string | null
          expression_of_concern: boolean
          id: string
          ingestion_status: string
          license_status: string
          metadata: Json
          normalized_title: string
          pmid: string | null
          retracted: boolean
          review_status: string
          source_key: string
          source_type: string
          superseded_by: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          access_status: string
          archived_at?: string | null
          correction_notice?: string | null
          created_at?: string
          created_by: string
          document_hash?: string | null
          doi?: string | null
          expression_of_concern?: boolean
          id?: string
          ingestion_status?: string
          license_status: string
          metadata?: Json
          normalized_title: string
          pmid?: string | null
          retracted?: boolean
          review_status?: string
          source_key: string
          source_type: string
          superseded_by?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          access_status?: string
          archived_at?: string | null
          correction_notice?: string | null
          created_at?: string
          created_by?: string
          document_hash?: string | null
          doi?: string | null
          expression_of_concern?: boolean
          id?: string
          ingestion_status?: string
          license_status?: string
          metadata?: Json
          normalized_title?: string
          pmid?: string | null
          retracted?: boolean
          review_status?: string
          source_key?: string
          source_type?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "research_sources_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "research_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      research_terminology_mappings: {
        Row: {
          context: string | null
          created_at: string
          created_by: string
          id: string
          normalized_key: string
          original_term: string
          preserve_distinct: boolean
          relationship: string
          version: number
        }
        Insert: {
          context?: string | null
          created_at?: string
          created_by: string
          id?: string
          normalized_key: string
          original_term: string
          preserve_distinct?: boolean
          relationship: string
          version?: number
        }
        Update: {
          context?: string | null
          created_at?: string
          created_by?: string
          id?: string
          normalized_key?: string
          original_term?: string
          preserve_distinct?: boolean
          relationship?: string
          version?: number
        }
        Relationships: []
      }
      root_cause_feedback_audit: {
        Row: {
          action_id: string
          action_snapshot: Json
          actor_id: string
          athlete_id: string
          created_at: string
          id: string
        }
        Insert: {
          action_id: string
          action_snapshot: Json
          actor_id: string
          athlete_id: string
          created_at?: string
          id?: string
        }
        Update: {
          action_id?: string
          action_snapshot?: Json
          actor_id?: string
          athlete_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_feedback_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      root_cause_invalidations: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          id: string
          occurred_at: string
          processed_at: string | null
          processed_snapshot_id: string | null
          source_id: string
          status: string
          trigger_id: string
          trigger_type: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by: string
          id?: string
          occurred_at: string
          processed_at?: string | null
          processed_snapshot_id?: string | null
          source_id: string
          status?: string
          trigger_id: string
          trigger_type: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_at?: string
          processed_at?: string | null
          processed_snapshot_id?: string | null
          source_id?: string
          status?: string
          trigger_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_invalidations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "root_cause_invalidations_processed_snapshot_id_fkey"
            columns: ["processed_snapshot_id"]
            isOneToOne: false
            referencedRelation: "root_cause_state_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      root_cause_recommendation_audit: {
        Row: {
          action: string
          actor_id: string
          athlete_id: string
          created_at: string
          id: string
          input_fingerprint: string
          snapshot_id: string
        }
        Insert: {
          action: string
          actor_id: string
          athlete_id: string
          created_at?: string
          id?: string
          input_fingerprint: string
          snapshot_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          athlete_id?: string
          created_at?: string
          id?: string
          input_fingerprint?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_recommendation_audit_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "root_cause_recommendation_audit_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "root_cause_recommendation_context_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      root_cause_recommendation_context_snapshots: {
        Row: {
          adapter_version: string
          analysis_id: string
          athlete_id: string
          context_id: string
          context_snapshot: Json
          created_at: string
          created_by: string
          id: string
          invalidation_fingerprint: string
          mapping_registry_version: string
          rollout_mode: string
        }
        Insert: {
          adapter_version: string
          analysis_id: string
          athlete_id: string
          context_id: string
          context_snapshot: Json
          created_at: string
          created_by: string
          id?: string
          invalidation_fingerprint: string
          mapping_registry_version: string
          rollout_mode: string
        }
        Update: {
          adapter_version?: string
          analysis_id?: string
          athlete_id?: string
          context_id?: string
          context_snapshot?: Json
          created_at?: string
          created_by?: string
          id?: string
          invalidation_fingerprint?: string
          mapping_registry_version?: string
          rollout_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_recommendation_context_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      root_cause_recommendation_invalidations: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          id: string
          occurred_at: string
          processed_at: string | null
          processed_snapshot_id: string | null
          source_id: string
          status: string
          trigger_id: string
          trigger_type: string
        }
        Insert: {
          athlete_id: string
          created_at?: string
          created_by: string
          id?: string
          occurred_at: string
          processed_at?: string | null
          processed_snapshot_id?: string | null
          source_id: string
          status?: string
          trigger_id: string
          trigger_type: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          id?: string
          occurred_at?: string
          processed_at?: string | null
          processed_snapshot_id?: string | null
          source_id?: string
          status?: string
          trigger_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_recommendation_invalidati_processed_snapshot_id_fkey"
            columns: ["processed_snapshot_id"]
            isOneToOne: false
            referencedRelation: "root_cause_recommendation_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "root_cause_recommendation_invalidations_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
      }
      root_cause_recommendation_mapping_registry: {
        Row: {
          created_at: string
          created_by: string
          id: string
          mapping_id: string
          mapping_snapshot: Json
          mapping_version: string
          registry_version: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          mapping_id: string
          mapping_snapshot: Json
          mapping_version: string
          registry_version: string
          status: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          mapping_id?: string
          mapping_snapshot?: Json
          mapping_version?: string
          registry_version?: string
          status?: string
        }
        Relationships: []
      }
      root_cause_recommendation_shadow_comparisons: {
        Row: {
          athlete_id: string
          comparison_id: string
          comparison_snapshot: Json
          created_at: string
          created_by: string
          id: string
          snapshot_id: string
        }
        Insert: {
          athlete_id: string
          comparison_id: string
          comparison_snapshot: Json
          created_at: string
          created_by: string
          id?: string
          snapshot_id: string
        }
        Update: {
          athlete_id?: string
          comparison_id?: string
          comparison_snapshot?: Json
          created_at?: string
          created_by?: string
          id?: string
          snapshot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_recommendation_shadow_comparisons_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "root_cause_recommendation_shadow_comparisons_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "root_cause_recommendation_context_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      root_cause_state_snapshots: {
        Row: {
          athlete_id: string
          created_at: string
          created_by: string
          engine_version: string
          id: string
          input_fingerprint: string
          root_cause_state_id: string
          state_snapshot: Json
          state_version: string
          twin_updated_at: string
        }
        Insert: {
          athlete_id: string
          created_at: string
          created_by: string
          engine_version: string
          id?: string
          input_fingerprint: string
          root_cause_state_id: string
          state_snapshot: Json
          state_version: string
          twin_updated_at: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          created_by?: string
          engine_version?: string
          id?: string
          input_fingerprint?: string
          root_cause_state_id?: string
          state_snapshot?: Json
          state_version?: string
          twin_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "root_cause_state_snapshots_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
        ]
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
          is_reference_benchmark: boolean
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
          is_reference_benchmark?: boolean
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
          is_reference_benchmark?: boolean
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
      support_requests: {
        Row: {
          analysis_id: string | null
          category: string
          created_at: string
          diagnostic_context: Json
          id: string
          message: string
          safe_reference_id: string
          session_id: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis_id?: string | null
          category: string
          created_at?: string
          diagnostic_context?: Json
          id?: string
          message: string
          safe_reference_id: string
          session_id?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis_id?: string | null
          category?: string
          created_at?: string
          diagnostic_context?: Json
          id?: string
          message?: string
          safe_reference_id?: string
          session_id?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_requests_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_requests_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      team_athletes: {
        Row: {
          active: boolean
          athlete_id: string
          joined_at: string
          team_id: string
        }
        Insert: {
          active?: boolean
          athlete_id: string
          joined_at?: string
          team_id: string
        }
        Update: {
          active?: boolean
          athlete_id?: string
          joined_at?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_athletes_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "athletes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_athletes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_coaches: {
        Row: {
          coach_id: string
          created_at: string
          role: Database["public"]["Enums"]["organization_role"]
          team_id: string
        }
        Insert: {
          coach_id: string
          created_at?: string
          role: Database["public"]["Enums"]["organization_role"]
          team_id: string
        }
        Update: {
          coach_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["organization_role"]
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_coaches_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_coaches_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          organization_id: string
          season_label: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          organization_id: string
          season_label?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          season_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      activate_athlete_digital_twin_snapshot: {
        Args: { p_athlete_id: string; p_reason: string; p_snapshot_id: string }
        Returns: boolean
      }
      activate_intelligence_pipeline: {
        Args: {
          p_actor_id: string
          p_execution_plan_id: string
          p_snapshot_ids: Json
        }
        Returns: string
      }
      activate_staged_intelligence_pipeline: {
        Args: { p_actor_id: string; p_execution_plan_id: string }
        Returns: string
      }
      append_and_activate_athlete_digital_twin_snapshot: {
        Args: { p_athlete_id: string; p_reason: string; p_snapshot: Json }
        Returns: string
      }
      append_and_activate_coaching_state: {
        Args: { p_athlete_id: string; p_state: Json; p_triggers?: Json }
        Returns: string
      }
      append_and_activate_performance_optimization: {
        Args: { p_athlete_id: string; p_state: Json }
        Returns: string
      }
      append_and_activate_root_cause_recommendation_context: {
        Args: { p_athlete_id: string; p_context: Json; p_trigger_ids?: Json }
        Returns: string
      }
      append_and_activate_root_cause_state: {
        Args: { p_athlete_id: string; p_state: Json }
        Returns: string
      }
      append_athlete_timeline_event: {
        Args: { p_athlete_id: string; p_event: Json }
        Returns: boolean
      }
      append_intelligence_execution_trace: {
        Args: { p_job_id: string; p_plan_id: string; p_trace: Json }
        Returns: string
      }
      append_root_cause_feedback: {
        Args: {
          p_action: Json
          p_athlete_id: string
          p_root_cause_state_id: string
        }
        Returns: boolean
      }
      can_access_athlete: { Args: { p_athlete_id: string }; Returns: boolean }
      can_edit_athlete_notes: {
        Args: { p_athlete_id: string }
        Returns: boolean
      }
      cancel_analysis_job: { Args: { p_job_id: string }; Returns: boolean }
      claim_analysis_job: {
        Args: {
          p_lease_seconds?: number
          p_worker_id: string
          p_worker_version: string
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
          progress: Json | null
          session_id: string
          source_video_path: string
          started_at: string | null
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
          user_action_required: boolean
          user_message: string | null
          worker_version: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "analysis_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_intelligence_execution_job: {
        Args: { p_lease_seconds?: number; p_worker_id: string }
        Returns: {
          athlete_id: string
          attempt_count: number
          available_at: string
          cache_hit: boolean | null
          claim_token: string | null
          claimed_by: string | null
          created_at: string
          dependencies: Json
          engine_id: string
          engine_version: string
          execution_plan_id: string
          failure_code: string | null
          failure_kind: string | null
          failure_message: string | null
          finished_at: string | null
          id: string
          lease_expires_at: string | null
          max_attempts: number
          snapshot_id: string | null
          started_at: string | null
          state: Database["public"]["Enums"]["intelligence_execution_state"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "intelligence_execution_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      cleanup_unprotected_sessions: {
        Args: { p_dry_run?: boolean }
        Returns: {
          athlete_id: string
          session_id: string
          session_name: string
          status: Database["public"]["Enums"]["session_status"]
        }[]
      }
      complete_analysis_job: {
        Args: {
          p_artifact_paths: Json
          p_claim_token: string
          p_input_snapshot: Json
          p_job_id: string
          p_keypoints_path: string
          p_metrics: Json
          p_model_version: string
          p_provenance: Json
          p_result_payload: Json
          p_source_fps: number
          p_worker_id: string
        }
        Returns: boolean
      }
      complete_experimental_analysis_job: {
        Args: {
          p_artifact_paths: Json
          p_claim_token: string
          p_experimental_result: Json
          p_input_snapshot: Json
          p_job_id: string
          p_keypoints_path: string
          p_metrics: Json
          p_model_version: string
          p_provenance: Json
          p_result_payload: Json
          p_source_fps: number
          p_worker_id: string
        }
        Returns: boolean
      }
      create_shadow_intelligence_manifest: {
        Args: { p_execution_plan_id: string; p_replay_run_id?: string }
        Returns: string
      }
      enqueue_coaching_state_invalidation: {
        Args: { p_athlete_id: string; p_trigger: Json }
        Returns: boolean
      }
      enqueue_performance_optimization_invalidation: {
        Args: { p_athlete_id: string; p_trigger: Json }
        Returns: boolean
      }
      enqueue_root_cause_invalidation: {
        Args: { p_athlete_id: string; p_trigger: Json }
        Returns: boolean
      }
      enqueue_root_cause_recommendation_invalidation: {
        Args: { p_athlete_id: string; p_trigger: Json }
        Returns: boolean
      }
      fail_analysis_job: {
        Args: {
          p_backoff_seconds: number
          p_claim_token: string
          p_error_code: string
          p_error_message: string
          p_error_stage: string
          p_failure_category: string
          p_job_id: string
          p_retryable: boolean
          p_user_action_required?: boolean
          p_user_message: string
          p_worker_id: string
        }
        Returns: Database["public"]["Enums"]["analysis_job_status"]
      }
      fail_intelligence_execution_plan: {
        Args: { p_actor_id: string; p_failure: Json; p_plan_id: string }
        Returns: boolean
      }
      get_activated_intelligence_snapshot: {
        Args: { p_athlete_id: string; p_engine_id: string }
        Returns: Json
      }
      get_analysis_job_status: {
        Args: { p_analysis_id: string }
        Returns: {
          attempt_count: number
          progress: Json
          status: Database["public"]["Enums"]["analysis_job_status"]
          updated_at: string
          user_message: string
        }[]
      }
      get_athlete_digital_twin_summary: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      get_benchmark_developer_catalog: { Args: never; Returns: Json }
      get_cached_coaching_state: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      get_cached_performance_optimization: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      get_cached_root_cause_recommendation_context: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      get_cached_root_cause_state: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      get_intelligence_execution_job_internal: {
        Args: { p_job_id: string; p_plan_id: string }
        Returns: Json
      }
      get_intelligence_execution_plan_internal: {
        Args: { p_plan_id: string }
        Returns: Json
      }
      get_intelligence_orchestration_dashboard: {
        Args: { p_athlete_id: string }
        Returns: Json
      }
      get_orchestration_operational_dashboard: {
        Args: { p_athlete_id: string; p_limit?: number }
        Returns: Json
      }
      get_projection_developer_summary: { Args: never; Returns: Json }
      get_research_claim_detail: { Args: { p_claim_id: string }; Returns: Json }
      get_research_source_detail: {
        Args: { p_source_id: string }
        Returns: Json
      }
      get_research_workspace_summary: { Args: never; Returns: Json }
      heartbeat_analysis_job: {
        Args: {
          p_claim_token: string
          p_job_id: string
          p_lease_seconds?: number
          p_progress?: Json
          p_worker_id: string
        }
        Returns: boolean
      }
      heartbeat_intelligence_execution_job: {
        Args: {
          p_claim_token: string
          p_job_id: string
          p_lease_seconds?: number
          p_worker_id: string
        }
        Returns: boolean
      }
      is_organization_manager: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_organization_member: {
        Args: { p_organization_id: string }
        Returns: boolean
      }
      is_research_reviewer: { Args: never; Returns: boolean }
      persist_shadow_intelligence_comparison: {
        Args: {
          p_execution_plan_id: string
          p_report: Json
          p_shadow_manifest_id: string
        }
        Returns: string
      }
      recover_intelligence_execution_jobs: {
        Args: { p_cursor?: string; p_limit: number }
        Returns: Json
      }
      replace_working_analysis: {
        Args: {
          p_analysis_fps: number
          p_explainability_schema_version: string
          p_input_snapshot: Json
          p_metric_schema_version: string
          p_pipeline_version: string
          p_session_id: string
          p_timing_compatibility_group: string
        }
        Returns: string
      }
      requeue_analysis_job: { Args: { p_job_id: string }; Returns: boolean }
      reset_working_analysis: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      retrieve_production_research_evidence: {
        Args: { p_limit?: number; p_metric_keys: string[]; p_usage: string }
        Returns: Json
      }
      review_research_claim: {
        Args: { p_claim_id: string; p_reason: string; p_status: string }
        Returns: boolean
      }
      rollback_intelligence_pipeline: {
        Args: {
          p_actor_id: string
          p_execution_plan_id: string
          p_reason: string
        }
        Returns: string
      }
      save_working_analysis_snapshot: {
        Args: { p_notes?: string; p_session_id: string }
        Returns: string
      }
      schedule_intelligence_execution_retry: {
        Args: {
          p_delay_ms: number
          p_failure: Json
          p_job_id: string
          p_plan_id: string
        }
        Returns: boolean
      }
      set_analysis_job_stage: {
        Args: {
          p_claim_token: string
          p_job_id: string
          p_status: Database["public"]["Enums"]["analysis_job_status"]
          p_worker_id: string
        }
        Returns: boolean
      }
      set_session_reference_benchmark: {
        Args: { p_protected: boolean; p_session_id: string }
        Returns: boolean
      }
      stage_intelligence_snapshot: {
        Args: { p_actor_id: string; p_plan_id: string; p_snapshot: Json }
        Returns: string
      }
      transition_intelligence_execution_job: {
        Args: {
          p_actor_id: string
          p_job_id: string
          p_patch: Json
          p_plan_id: string
        }
        Returns: boolean
      }
      update_session_source_metadata: {
        Args: {
          p_codec: string
          p_duration_s: number
          p_fps: number
          p_fps_classification: string
          p_fps_metadata: Json
          p_height: number
          p_session_id: string
          p_width: number
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
      coach_note_kind: "session" | "technique" | "training" | "competition"
      intelligence_execution_state:
        | "queued"
        | "waiting"
        | "ready"
        | "running"
        | "retrying"
        | "succeeded"
        | "failed"
        | "cancelled"
        | "rolled_back"
      organization_role:
        | "owner"
        | "head_coach"
        | "assistant_coach"
        | "read_only_staff"
      session_status:
        | "uploading"
        | "uploaded"
        | "queued"
        | "analyzing"
        | "complete"
        | "failed"
      sprint_analysis_type: "fly" | "acceleration"
      user_role: "coach" | "athlete" | "admin"
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
          type: Database["storage"]["Enums"]["buckettype"]
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
          type?: Database["storage"]["Enums"]["buckettype"]
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
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
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
          metadata: Json | null
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
          metadata?: Json | null
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
          metadata?: Json | null
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
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
      analysis_job_status: [
        "queued",
        "claimed",
        "downloading",
        "validating",
        "processing",
        "generating_results",
        "uploading_artifacts",
        "completing",
        "completed",
        "retry_scheduled",
        "failed",
        "dead_lettered",
        "cancelled",
      ],
      analysis_status: ["queued", "running", "complete", "failed"],
      coach_note_kind: ["session", "technique", "training", "competition"],
      intelligence_execution_state: [
        "queued",
        "waiting",
        "ready",
        "running",
        "retrying",
        "succeeded",
        "failed",
        "cancelled",
        "rolled_back",
      ],
      organization_role: [
        "owner",
        "head_coach",
        "assistant_coach",
        "read_only_staff",
      ],
      session_status: [
        "uploading",
        "uploaded",
        "queued",
        "analyzing",
        "complete",
        "failed",
      ],
      sprint_analysis_type: ["fly", "acceleration"],
      user_role: ["coach", "athlete", "admin"],
    },
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
