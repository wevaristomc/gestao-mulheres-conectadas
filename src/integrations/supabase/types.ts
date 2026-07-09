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
      importacoes_presenca: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string | null
          atualizado_em: string
          aula_id: string | null
          avisos: Json
          ch_dia: number | null
          conteudo: string | null
          criado_em: string
          data_aula: string | null
          horario: string | null
          id: string
          instrutor: string | null
          itens: Json
          nao_identificados: Json
          revisao_em: string | null
          revisao_observacao: string | null
          revisao_por: string | null
          revisao_status: string
          status: string
          turma_id: string | null
          turma_identificada: string | null
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          aula_id?: string | null
          avisos?: Json
          ch_dia?: number | null
          conteudo?: string | null
          criado_em?: string
          data_aula?: string | null
          horario?: string | null
          id?: string
          instrutor?: string | null
          itens?: Json
          nao_identificados?: Json
          revisao_em?: string | null
          revisao_observacao?: string | null
          revisao_por?: string | null
          revisao_status?: string
          status?: string
          turma_id?: string | null
          turma_identificada?: string | null
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string | null
          atualizado_em?: string
          aula_id?: string | null
          avisos?: Json
          ch_dia?: number | null
          conteudo?: string | null
          criado_em?: string
          data_aula?: string | null
          horario?: string | null
          id?: string
          instrutor?: string | null
          itens?: Json
          nao_identificados?: Json
          revisao_em?: string | null
          revisao_observacao?: string | null
          revisao_por?: string | null
          revisao_status?: string
          status?: string
          turma_id?: string | null
          turma_identificada?: string | null
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          chave_dedup: string | null
          corpo: string | null
          criado_em: string
          id: string
          lida: boolean
          link_rota: string | null
          origem: string
          severidade: string
          tipo: string
          titulo: string
          user_id: string | null
        }
        Insert: {
          chave_dedup?: string | null
          corpo?: string | null
          criado_em?: string
          id?: string
          lida?: boolean
          link_rota?: string | null
          origem?: string
          severidade?: string
          tipo: string
          titulo: string
          user_id?: string | null
        }
        Update: {
          chave_dedup?: string | null
          corpo?: string | null
          criado_em?: string
          id?: string
          lida?: boolean
          link_rota?: string | null
          origem?: string
          severidade?: string
          tipo?: string
          titulo?: string
          user_id?: string | null
        }
        Relationships: []
      }
      orbe_conversas: {
        Row: {
          atualizado_em: string
          criado_em: string
          id: string
          titulo: string | null
          user_id: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          titulo?: string | null
          user_id: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          id?: string
          titulo?: string | null
          user_id?: string
        }
        Relationships: []
      }
      orbe_mensagens: {
        Row: {
          content: string
          conversa_id: string
          criado_em: string
          id: string
          role: string
          tokens: number
          tool_name: string | null
        }
        Insert: {
          content: string
          conversa_id: string
          criado_em?: string
          id?: string
          role: string
          tokens?: number
          tool_name?: string | null
        }
        Update: {
          content?: string
          conversa_id?: string
          criado_em?: string
          id?: string
          role?: string
          tokens?: number
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orbe_mensagens_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "orbe_conversas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
