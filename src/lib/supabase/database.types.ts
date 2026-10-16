export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          created_at: string;
          id: string;
          kind: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      ai_messages: {
        Row: {
          content: string;
          conversation_id: string;
          created_at: string;
          id: string;
          image_path: string | null;
          logged_group_id: string | null;
          payload: Json | null;
          role: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          content?: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          logged_group_id?: string | null;
          payload?: Json | null;
          role: string;
          user_id?: string;
        };
        Update: {
          content?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          logged_group_id?: string | null;
          payload?: Json | null;
          role?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "ai_conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_usage: {
        Row: {
          count: number;
          day: string;
          feature: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          count?: number;
          day: string;
          feature: string;
          user_id: string;
        };
        Update: {
          count?: number;
          day?: string;
          feature?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      app_migrations: {
        Row: {
          applied_at: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          applied_at?: string;
          name: string;
        };
        Update: {
          applied_at?: string;
          name?: string;
        };
        Relationships: [];
      };
      app_secrets: {
        Row: {
          created_at: string;
          key: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          key: string;
          value: string;
        };
        Update: {
          created_at?: string;
          key?: string;
          value?: string;
        };
        Relationships: [];
      };
      athletic_tests: {
        Row: {
          conditions: string | null;
          created_at: string;
          id: string;
          local_date: string;
          notes: string | null;
          sprint_distance_m: number | null;
          test_type: string;
          user_id: string;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          conditions?: string | null;
          created_at?: string;
          id?: string;
          local_date: string;
          notes?: string | null;
          sprint_distance_m?: number | null;
          test_type: string;
          user_id?: string;
          value: number;
        };
        Update: {
          conditions?: string | null;
          created_at?: string;
          id?: string;
          local_date?: string;
          notes?: string | null;
          sprint_distance_m?: number | null;
          test_type?: string;
          user_id?: string;
          value?: number;
        };
        Relationships: [];
      };
      body_measurements: {
        Row: {
          biceps_flexed_in: number | null;
          body_fat_pct: number | null;
          calf_in: number | null;
          chest_in: number | null;
          created_at: string;
          forearm_in: number | null;
          hips_in: number | null;
          id: string;
          local_date: string;
          notes: string | null;
          shoulders_in: number | null;
          thigh_in: number | null;
          user_id: string;
          waist_in: number | null;
        };
        ComputedFields: never;
        Insert: {
          biceps_flexed_in?: number | null;
          body_fat_pct?: number | null;
          calf_in?: number | null;
          chest_in?: number | null;
          created_at?: string;
          forearm_in?: number | null;
          hips_in?: number | null;
          id?: string;
          local_date: string;
          notes?: string | null;
          shoulders_in?: number | null;
          thigh_in?: number | null;
          user_id?: string;
          waist_in?: number | null;
        };
        Update: {
          biceps_flexed_in?: number | null;
          body_fat_pct?: number | null;
          calf_in?: number | null;
          chest_in?: number | null;
          created_at?: string;
          forearm_in?: number | null;
          hips_in?: number | null;
          id?: string;
          local_date?: string;
          notes?: string | null;
          shoulders_in?: number | null;
          thigh_in?: number | null;
          user_id?: string;
          waist_in?: number | null;
        };
        Relationships: [];
      };
      custom_exercises: {
        Row: {
          category: string;
          created_at: string;
          default_rest_sec: number;
          id: string;
          instructions: string | null;
          name: string;
          primary_muscles: string[];
          slug: string;
          tracking: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          category?: string;
          created_at?: string;
          default_rest_sec?: number;
          id?: string;
          instructions?: string | null;
          name: string;
          primary_muscles?: string[];
          slug: string;
          tracking?: string;
          user_id?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          default_rest_sec?: number;
          id?: string;
          instructions?: string | null;
          name?: string;
          primary_muscles?: string[];
          slug?: string;
          tracking?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      day_plans: {
        Row: {
          created_at: string;
          id: string;
          moved_from: string | null;
          note: string | null;
          plan_date: string;
          reason: string | null;
          template_key: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          moved_from?: string | null;
          note?: string | null;
          plan_date: string;
          reason?: string | null;
          template_key: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          moved_from?: string | null;
          note?: string | null;
          plan_date?: string;
          reason?: string | null;
          template_key?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      exercise_sets: {
        Row: {
          completed: boolean;
          completed_at: string | null;
          created_at: string;
          duration_sec: number | null;
          exercise_name: string;
          exercise_order: number;
          exercise_slug: string;
          id: string;
          kind: string;
          local_date: string;
          notes: string | null;
          reps: number | null;
          rest_sec: number | null;
          rir: number | null;
          session_id: string;
          set_index: number;
          suggested_weight_lb: number | null;
          target_rep_high: number | null;
          target_rep_low: number | null;
          target_rir: string | null;
          target_unit: string;
          updated_at: string;
          user_id: string;
          weight_lb: number | null;
        };
        ComputedFields: never;
        Insert: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          duration_sec?: number | null;
          exercise_name: string;
          exercise_order?: number;
          exercise_slug: string;
          id?: string;
          kind?: string;
          local_date: string;
          notes?: string | null;
          reps?: number | null;
          rest_sec?: number | null;
          rir?: number | null;
          session_id: string;
          set_index?: number;
          suggested_weight_lb?: number | null;
          target_rep_high?: number | null;
          target_rep_low?: number | null;
          target_rir?: string | null;
          target_unit?: string;
          updated_at?: string;
          user_id?: string;
          weight_lb?: number | null;
        };
        Update: {
          completed?: boolean;
          completed_at?: string | null;
          created_at?: string;
          duration_sec?: number | null;
          exercise_name?: string;
          exercise_order?: number;
          exercise_slug?: string;
          id?: string;
          kind?: string;
          local_date?: string;
          notes?: string | null;
          reps?: number | null;
          rest_sec?: number | null;
          rir?: number | null;
          session_id?: string;
          set_index?: number;
          suggested_weight_lb?: number | null;
          target_rep_high?: number | null;
          target_rep_low?: number | null;
          target_rir?: string | null;
          target_unit?: string;
          updated_at?: string;
          user_id?: string;
          weight_lb?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "exercise_sets_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      food_entries: {
        Row: {
          amount: number;
          base_amount: number;
          base_calories: number;
          base_carbs_g: number;
          base_fat_g: number;
          base_protein_g: number;
          brand: string | null;
          calories: number;
          carbs_g: number;
          confidence: string;
          created_at: string;
          eaten_at: string;
          fat_g: number;
          grams: number | null;
          id: string;
          local_date: string;
          meal: string;
          meal_group_id: string | null;
          name: string;
          photo_path: string | null;
          protein_g: number;
          saved_food_id: string | null;
          source: string;
          source_name: string | null;
          source_url: string | null;
          unit: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount?: number;
          base_amount?: number;
          base_calories?: number;
          base_carbs_g?: number;
          base_fat_g?: number;
          base_protein_g?: number;
          brand?: string | null;
          calories: number;
          carbs_g?: number;
          confidence?: string;
          created_at?: string;
          eaten_at?: string;
          fat_g?: number;
          grams?: number | null;
          id?: string;
          local_date: string;
          meal: string;
          meal_group_id?: string | null;
          name: string;
          photo_path?: string | null;
          protein_g?: number;
          saved_food_id?: string | null;
          source?: string;
          source_name?: string | null;
          source_url?: string | null;
          unit?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          amount?: number;
          base_amount?: number;
          base_calories?: number;
          base_carbs_g?: number;
          base_fat_g?: number;
          base_protein_g?: number;
          brand?: string | null;
          calories?: number;
          carbs_g?: number;
          confidence?: string;
          created_at?: string;
          eaten_at?: string;
          fat_g?: number;
          grams?: number | null;
          id?: string;
          local_date?: string;
          meal?: string;
          meal_group_id?: string | null;
          name?: string;
          photo_path?: string | null;
          protein_g?: number;
          saved_food_id?: string | null;
          source?: string;
          source_name?: string | null;
          source_url?: string | null;
          unit?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      goal_changes: {
        Row: {
          changed_at: string;
          field: string;
          id: string;
          new_value: number | null;
          old_value: number | null;
          reason: string | null;
          source: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          changed_at?: string;
          field: string;
          id?: string;
          new_value?: number | null;
          old_value?: number | null;
          reason?: string | null;
          source?: string;
          user_id?: string;
        };
        Update: {
          changed_at?: string;
          field?: string;
          id?: string;
          new_value?: number | null;
          old_value?: number | null;
          reason?: string | null;
          source?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      habit_definitions: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          key: string;
          kind: string;
          label: string;
          sort: number;
          target: number | null;
          unit: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key: string;
          kind: string;
          label: string;
          sort?: number;
          target?: number | null;
          unit?: string | null;
          user_id?: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          key?: string;
          kind?: string;
          label?: string;
          sort?: number;
          target?: number | null;
          unit?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      habit_logs: {
        Row: {
          done: boolean;
          habit_key: string;
          id: string;
          local_date: string;
          updated_at: string;
          user_id: string;
          value: number | null;
        };
        ComputedFields: never;
        Insert: {
          done?: boolean;
          habit_key: string;
          id?: string;
          local_date: string;
          updated_at?: string;
          user_id?: string;
          value?: number | null;
        };
        Update: {
          done?: boolean;
          habit_key?: string;
          id?: string;
          local_date?: string;
          updated_at?: string;
          user_id?: string;
          value?: number | null;
        };
        Relationships: [];
      };
      monthly_reviews: {
        Row: {
          generated_at: string;
          id: string;
          month: string;
          priorities: NonNullable<Json>;
          stats: NonNullable<Json>;
          summary: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          generated_at?: string;
          id?: string;
          month: string;
          priorities?: NonNullable<Json>;
          stats: NonNullable<Json>;
          summary?: string | null;
          user_id?: string;
        };
        Update: {
          generated_at?: string;
          id?: string;
          month?: string;
          priorities?: NonNullable<Json>;
          stats?: NonNullable<Json>;
          summary?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          calorie_goal: number;
          carb_goal: number;
          coach_access: NonNullable<Json>;
          created_at: string;
          display_name: string | null;
          experience: string;
          fat_goal: number;
          goal_range_max_lb: number | null;
          goal_range_min_lb: number | null;
          goal_weight_lb: number | null;
          height_cm: number | null;
          id: string;
          length_unit: string;
          onboarded: boolean;
          prefs: NonNullable<Json>;
          protein_goal: number;
          reminders: NonNullable<Json>;
          roadmap: NonNullable<Json>;
          sleep_goal_h: number;
          start_date: string;
          start_weight_lb: number | null;
          steps_goal: number;
          target_date: string;
          timezone: string;
          training_mode: string;
          updated_at: string;
          volleyball_per_week: number;
          water_goal_ml: number;
          weekly_schedule: NonNullable<Json>;
          weight_unit: string;
        };
        ComputedFields: never;
        Insert: {
          calorie_goal?: number;
          carb_goal?: number;
          coach_access?: NonNullable<Json>;
          created_at?: string;
          display_name?: string | null;
          experience?: string;
          fat_goal?: number;
          goal_range_max_lb?: number | null;
          goal_range_min_lb?: number | null;
          goal_weight_lb?: number | null;
          height_cm?: number | null;
          id: string;
          length_unit?: string;
          onboarded?: boolean;
          prefs?: NonNullable<Json>;
          protein_goal?: number;
          reminders?: NonNullable<Json>;
          roadmap?: NonNullable<Json>;
          sleep_goal_h?: number;
          start_date?: string;
          start_weight_lb?: number | null;
          steps_goal?: number;
          target_date?: string;
          timezone?: string;
          training_mode?: string;
          updated_at?: string;
          volleyball_per_week?: number;
          water_goal_ml?: number;
          weekly_schedule?: NonNullable<Json>;
          weight_unit?: string;
        };
        Update: {
          calorie_goal?: number;
          carb_goal?: number;
          coach_access?: NonNullable<Json>;
          created_at?: string;
          display_name?: string | null;
          experience?: string;
          fat_goal?: number;
          goal_range_max_lb?: number | null;
          goal_range_min_lb?: number | null;
          goal_weight_lb?: number | null;
          height_cm?: number | null;
          id?: string;
          length_unit?: string;
          onboarded?: boolean;
          prefs?: NonNullable<Json>;
          protein_goal?: number;
          reminders?: NonNullable<Json>;
          roadmap?: NonNullable<Json>;
          sleep_goal_h?: number;
          start_date?: string;
          start_weight_lb?: number | null;
          steps_goal?: number;
          target_date?: string;
          timezone?: string;
          training_mode?: string;
          updated_at?: string;
          volleyball_per_week?: number;
          water_goal_ml?: number;
          weekly_schedule?: NonNullable<Json>;
          weight_unit?: string;
        };
        Relationships: [];
      };
      program_templates: {
        Row: {
          created_at: string;
          exercises: NonNullable<Json>;
          focus: string | null;
          id: string;
          key: string;
          name: string;
          sort: number;
          updated_at: string;
          user_id: string;
          warmup: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          exercises?: NonNullable<Json>;
          focus?: string | null;
          id?: string;
          key: string;
          name: string;
          sort?: number;
          updated_at?: string;
          user_id?: string;
          warmup?: NonNullable<Json>;
        };
        Update: {
          created_at?: string;
          exercises?: NonNullable<Json>;
          focus?: string | null;
          id?: string;
          key?: string;
          name?: string;
          sort?: number;
          updated_at?: string;
          user_id?: string;
          warmup?: NonNullable<Json>;
        };
        Relationships: [];
      };
      progress_photos: {
        Row: {
          created_at: string;
          height: number | null;
          id: string;
          local_date: string;
          notes: string | null;
          pose: string;
          storage_path: string;
          user_id: string;
          width: number | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          height?: number | null;
          id?: string;
          local_date: string;
          notes?: string | null;
          pose: string;
          storage_path: string;
          user_id?: string;
          width?: number | null;
        };
        Update: {
          created_at?: string;
          height?: number | null;
          id?: string;
          local_date?: string;
          notes?: string | null;
          pose?: string;
          storage_path?: string;
          user_id?: string;
          width?: number | null;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      recovery_logs: {
        Row: {
          created_at: string;
          energy: number | null;
          fatigue: number | null;
          id: string;
          local_date: string;
          notes: string | null;
          pain_notes: string | null;
          sleep_hours: number | null;
          sleep_quality: number | null;
          soreness: number | null;
          stress: number | null;
          updated_at: string;
          user_id: string;
          volleyball: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          energy?: number | null;
          fatigue?: number | null;
          id?: string;
          local_date: string;
          notes?: string | null;
          pain_notes?: string | null;
          sleep_hours?: number | null;
          sleep_quality?: number | null;
          soreness?: number | null;
          stress?: number | null;
          updated_at?: string;
          user_id?: string;
          volleyball?: boolean;
        };
        Update: {
          created_at?: string;
          energy?: number | null;
          fatigue?: number | null;
          id?: string;
          local_date?: string;
          notes?: string | null;
          pain_notes?: string | null;
          sleep_hours?: number | null;
          sleep_quality?: number | null;
          soreness?: number | null;
          stress?: number | null;
          updated_at?: string;
          user_id?: string;
          volleyball?: boolean;
        };
        Relationships: [];
      };
      reminder_deliveries: {
        Row: {
          due_key: string;
          reminder: string;
          sent_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          due_key: string;
          reminder: string;
          sent_at?: string;
          user_id: string;
        };
        Update: {
          due_key?: string;
          reminder?: string;
          sent_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      saved_foods: {
        Row: {
          brand: string | null;
          calories: number;
          carbs_g: number;
          created_at: string;
          fat_g: number;
          grams: number | null;
          id: string;
          is_favorite: boolean;
          last_used_at: string | null;
          name: string;
          protein_g: number;
          serving_amount: number;
          serving_unit: string;
          source: string;
          source_name: string | null;
          source_url: string | null;
          use_count: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          brand?: string | null;
          calories: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number | null;
          id?: string;
          is_favorite?: boolean;
          last_used_at?: string | null;
          name: string;
          protein_g?: number;
          serving_amount?: number;
          serving_unit?: string;
          source?: string;
          source_name?: string | null;
          source_url?: string | null;
          use_count?: number;
          user_id?: string;
        };
        Update: {
          brand?: string | null;
          calories?: number;
          carbs_g?: number;
          created_at?: string;
          fat_g?: number;
          grams?: number | null;
          id?: string;
          is_favorite?: boolean;
          last_used_at?: string | null;
          name?: string;
          protein_g?: number;
          serving_amount?: number;
          serving_unit?: string;
          source?: string;
          source_name?: string | null;
          source_url?: string | null;
          use_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      saved_meals: {
        Row: {
          created_at: string;
          id: string;
          is_favorite: boolean;
          items: NonNullable<Json>;
          last_used_at: string | null;
          name: string;
          use_count: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_favorite?: boolean;
          items?: NonNullable<Json>;
          last_used_at?: string | null;
          name: string;
          use_count?: number;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_favorite?: boolean;
          items?: NonNullable<Json>;
          last_used_at?: string | null;
          name?: string;
          use_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      volleyball_sessions: {
        Row: {
          created_at: string;
          duration_min: number | null;
          id: string;
          intensity: number | null;
          kind: string;
          local_date: string;
          notes: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          duration_min?: number | null;
          id?: string;
          intensity?: number | null;
          kind?: string;
          local_date: string;
          notes?: string | null;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          duration_min?: number | null;
          id?: string;
          intensity?: number | null;
          kind?: string;
          local_date?: string;
          notes?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      water_logs: {
        Row: {
          amount_ml: number;
          id: string;
          local_date: string;
          logged_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_ml: number;
          id?: string;
          local_date: string;
          logged_at?: string;
          user_id?: string;
        };
        Update: {
          amount_ml?: number;
          id?: string;
          local_date?: string;
          logged_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      weight_entries: {
        Row: {
          created_at: string;
          id: string;
          local_date: string;
          measured_at: string;
          notes: string | null;
          user_id: string;
          weight_lb: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          local_date: string;
          measured_at?: string;
          notes?: string | null;
          user_id?: string;
          weight_lb: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          local_date?: string;
          measured_at?: string;
          notes?: string | null;
          user_id?: string;
          weight_lb?: number;
        };
        Relationships: [];
      };
      workout_sessions: {
        Row: {
          created_at: string;
          duration_sec: number | null;
          ended_at: string | null;
          id: string;
          local_date: string;
          mode: string;
          name: string;
          notes: string | null;
          pr_count: number;
          session_rpe: number | null;
          sets_completed: number;
          started_at: string;
          status: string;
          template_key: string | null;
          total_volume_lb: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          duration_sec?: number | null;
          ended_at?: string | null;
          id?: string;
          local_date: string;
          mode?: string;
          name: string;
          notes?: string | null;
          pr_count?: number;
          session_rpe?: number | null;
          sets_completed?: number;
          started_at?: string;
          status?: string;
          template_key?: string | null;
          total_volume_lb?: number;
          updated_at?: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          duration_sec?: number | null;
          ended_at?: string | null;
          id?: string;
          local_date?: string;
          mode?: string;
          name?: string;
          notes?: string | null;
          pr_count?: number;
          session_rpe?: number | null;
          sets_completed?: number;
          started_at?: string;
          status?: string;
          template_key?: string | null;
          total_volume_lb?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      daily_nutrition: {
        Row: {
          calories: number | null;
          carbs_g: number | null;
          entries: number | null;
          fat_g: number | null;
          local_date: string | null;
          protein_g: number | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      daily_water: {
        Row: {
          local_date: string | null;
          taps: number | null;
          total_ml: number | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      exercise_bests: {
        Row: {
          best_duration_sec: number | null;
          best_e1rm_lb: number | null;
          best_reps: number | null;
          best_weight_lb: number | null;
          exercise_name: string | null;
          exercise_slug: string | null;
          last_date: string | null;
          sessions: number | null;
          total_sets: number | null;
          total_volume_lb: number | null;
          user_id: string | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      exercise_daily: {
        Row: {
          best_e1rm_lb: number | null;
          exercise_slug: string | null;
          had_pr: boolean | null;
          local_date: string | null;
          max_reps: number | null;
          sets: number | null;
          top_weight_lb: number | null;
          user_id: string | null;
          volume_lb: number | null;
        };
        ComputedFields: never;
        Relationships: [];
      };
      pr_events: {
        Row: {
          e1rm_lb: number | null;
          exercise_name: string | null;
          exercise_slug: string | null;
          local_date: string | null;
          prior_best_e1rm: number | null;
          reps: number | null;
          session_id: string | null;
          set_id: string | null;
          user_id: string | null;
          weight_lb: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "exercise_sets_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      set_history: {
        Row: {
          completed: boolean | null;
          completed_at: string | null;
          created_at: string | null;
          duration_sec: number | null;
          e1rm_lb: number | null;
          exercise_name: string | null;
          exercise_order: number | null;
          exercise_slug: string | null;
          id: string | null;
          kind: string | null;
          local_date: string | null;
          notes: string | null;
          prior_best_e1rm: number | null;
          prior_best_weight: number | null;
          reps: number | null;
          rest_sec: number | null;
          rir: number | null;
          session_id: string | null;
          session_status: string | null;
          set_index: number | null;
          suggested_weight_lb: number | null;
          target_rep_high: number | null;
          target_rep_low: number | null;
          target_rir: string | null;
          target_unit: string | null;
          updated_at: string | null;
          user_id: string | null;
          weight_lb: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "exercise_sets_session_id_fkey";
            columns: ["session_id"];
            isOneToOne: false;
            referencedRelation: "workout_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      bump_ai_usage: {
        Args: { p_day: string; p_feature: string; p_limit: number };
        Returns: number;
      };
      pgg_reminders_status: { Args: Record<PropertyKey, never>; Returns: Json };
      pgg_schedule_reminders: { Args: { app_url: string }; Returns: string };
      pgg_unschedule_reminders: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
