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
      admin_integrations: {
        Row: {
          id: number
          melhor_envio_env: string
          melhor_envio_token: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          melhor_envio_env?: string
          melhor_envio_token?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          melhor_envio_env?: string
          melhor_envio_token?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cabin_types: {
        Row: {
          active: boolean
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          active?: boolean
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
        }
        Update: {
          active?: boolean
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      configurator_options: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          label: string
          question_id: string
          value: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          label: string
          question_id: string
          value: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          label?: string
          question_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "configurator_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "configurator_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      configurator_questions: {
        Row: {
          active: boolean
          created_at: string
          help_text: string | null
          id: string
          key: string
          label: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          help_text?: string | null
          id?: string
          key: string
          label: string
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          help_text?: string | null
          id?: string
          key?: string
          label?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string | null
          product_id: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
          vehicle_config: Json | null
        }
        Insert: {
          id?: string
          order_id?: string | null
          product_id?: string | null
          product_name: string
          quantity: number
          unit_price_cents: number
          vehicle_config?: Json | null
        }
        Update: {
          id?: string
          order_id?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          unit_price_cents?: number
          vehicle_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          discount_cents: number
          id: string
          mp_payment_id: string | null
          mp_preference_id: string | null
          notes: string | null
          payment_method: string
          shipping_address: Json | null
          shipping_cost_cents: number
          shipping_service: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          discount_cents?: number
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          payment_method?: string
          shipping_address?: Json | null
          shipping_cost_cents?: number
          shipping_service?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents: number
          total_cents: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          discount_cents?: number
          id?: string
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          payment_method?: string
          shipping_address?: Json | null
          shipping_cost_cents?: number
          shipping_service?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_cents?: number
          total_cents?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          category_id: string | null
          compare_at_cents: number | null
          created_at: string
          description: string | null
          featured: boolean
          height_cm: number
          id: string
          images: string[]
          length_cm: number
          name: string
          price_cents: number
          requires_vehicle_config: boolean
          short_description: string | null
          slug: string
          stock: number
          updated_at: string
          weight_kg: number
          width_cm: number
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          compare_at_cents?: number | null
          created_at?: string
          description?: string | null
          featured?: boolean
          height_cm?: number
          id?: string
          images?: string[]
          length_cm?: number
          name: string
          price_cents: number
          requires_vehicle_config?: boolean
          short_description?: string | null
          slug: string
          stock?: number
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Update: {
          active?: boolean
          category_id?: string | null
          compare_at_cents?: number | null
          created_at?: string
          description?: string | null
          featured?: boolean
          height_cm?: number
          id?: string
          images?: string[]
          length_cm?: number
          name?: string
          price_cents?: number
          requires_vehicle_config?: boolean
          short_description?: string | null
          slug?: string
          stock?: number
          updated_at?: string
          weight_kg?: number
          width_cm?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
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
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          id: number
          origin_cep: string
          pix_bank: string
          pix_copy_paste: string | null
          pix_discount_percent: number
          pix_enabled: boolean
          pix_holder_name: string
          pix_key: string
          pix_key_type: string
          pix_message: string
          pix_qr_image_url: string | null
          store_name: string
          whatsapp_number: string
        }
        Insert: {
          id?: number
          origin_cep?: string
          pix_bank?: string
          pix_copy_paste?: string | null
          pix_discount_percent?: number
          pix_enabled?: boolean
          pix_holder_name?: string
          pix_key?: string
          pix_key_type?: string
          pix_message?: string
          pix_qr_image_url?: string | null
          store_name?: string
          whatsapp_number?: string
        }
        Update: {
          id?: number
          origin_cep?: string
          pix_bank?: string
          pix_copy_paste?: string | null
          pix_discount_percent?: number
          pix_enabled?: boolean
          pix_holder_name?: string
          pix_key?: string
          pix_key_type?: string
          pix_message?: string
          pix_qr_image_url?: string | null
          store_name?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_makes: {
        Row: {
          active: boolean
          display_order: number
          id: string
          image_url: string | null
          name: string
        }
        Insert: {
          active?: boolean
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
        }
        Update: {
          active?: boolean
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
        }
        Relationships: []
      }
      vehicle_models: {
        Row: {
          active: boolean
          display_order: number
          id: string
          image_url: string | null
          make_id: string | null
          name: string
          year_from: number | null
          year_range: string | null
          year_to: number | null
        }
        Insert: {
          active?: boolean
          display_order?: number
          id?: string
          image_url?: string | null
          make_id?: string | null
          name: string
          year_from?: number | null
          year_range?: string | null
          year_to?: number | null
        }
        Update: {
          active?: boolean
          display_order?: number
          id?: string
          image_url?: string | null
          make_id?: string | null
          name?: string
          year_from?: number | null
          year_range?: string | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_models_make_id_fkey"
            columns: ["make_id"]
            isOneToOne: false
            referencedRelation: "vehicle_makes"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_product_map: {
        Row: {
          active: boolean
          answers: Json
          cabin_type_id: string | null
          id: string
          model_id: string | null
          product_id: string | null
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          active?: boolean
          answers?: Json
          cabin_type_id?: string | null
          id?: string
          model_id?: string | null
          product_id?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          active?: boolean
          answers?: Json
          cabin_type_id?: string | null
          id?: string
          model_id?: string | null
          product_id?: string | null
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_product_map_cabin_type_id_fkey"
            columns: ["cabin_type_id"]
            isOneToOne: false
            referencedRelation: "cabin_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_product_map_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_product_map_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_question_flow: {
        Row: {
          active: boolean
          auto_answer: string | null
          created_at: string
          display_order: number
          hidden: boolean
          id: string
          model_id: string
          question_id: string
          required: boolean
          year_from: number | null
          year_to: number | null
        }
        Insert: {
          active?: boolean
          auto_answer?: string | null
          created_at?: string
          display_order?: number
          hidden?: boolean
          id?: string
          model_id: string
          question_id: string
          required?: boolean
          year_from?: number | null
          year_to?: number | null
        }
        Update: {
          active?: boolean
          auto_answer?: string | null
          created_at?: string
          display_order?: number
          hidden?: boolean
          id?: string
          model_id?: string
          question_id?: string
          required?: boolean
          year_from?: number | null
          year_to?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_question_flow_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "vehicle_models"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_question_flow_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "configurator_questions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "customer"
      order_status: "pending" | "paid" | "shipped" | "delivered" | "cancelled"
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
      app_role: ["admin", "customer"],
      order_status: ["pending", "paid", "shipped", "delivered", "cancelled"],
    },
  },
} as const
