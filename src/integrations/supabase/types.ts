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
      instrutor_turmas: {
        Row: {
          criado_em: string
          id: string
          projeto_id: string | null
          turma_id: string
          user_id: string
          valor_hora: number
        }
        Insert: {
          criado_em?: string
          id?: string
          projeto_id?: string | null
          turma_id: string
          user_id: string
          valor_hora?: number
        }
        Update: {
          criado_em?: string
          id?: string
          projeto_id?: string | null
          turma_id?: string
          user_id?: string
          valor_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "instrutor_turmas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instrutor_turmas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
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
      permissoes_papel: {
        Row: {
          atualizado_em: string
          criado_em: string
          modulo: string
          pode_criar: boolean
          pode_editar: boolean
          pode_excluir: boolean
          pode_ver: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          modulo: string
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_ver?: boolean
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          modulo?: string
          pode_criar?: boolean
          pode_editar?: boolean
          pode_excluir?: boolean
          pode_ver?: boolean
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      projetos: {
        Row: {
          atualizado_em: string
          cnpj: string | null
          criado_em: string
          custo_aluno_hora: number | null
          endereco: string | null
          executora_nome: string | null
          id: string
          nome: string
          valor_global: number | null
          vigencia_fim: string | null
          vigencia_inicio: string | null
        }
        Insert: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          custo_aluno_hora?: number | null
          endereco?: string | null
          executora_nome?: string | null
          id?: string
          nome: string
          valor_global?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Update: {
          atualizado_em?: string
          cnpj?: string | null
          criado_em?: string
          custo_aluno_hora?: number | null
          endereco?: string | null
          executora_nome?: string | null
          id?: string
          nome?: string
          valor_global?: number | null
          vigencia_fim?: string | null
          vigencia_inicio?: string | null
        }
        Relationships: []
      }
      turmas: {
        Row: {
          atualizado_em: string
          codigo: string | null
          codigo_turma: string | null
          criado_em: string
          horario_realizacao: string | null
          id: string
          municipio: string | null
          nome: string | null
          projeto_id: string
          turno: string | null
        }
        Insert: {
          atualizado_em?: string
          codigo?: string | null
          codigo_turma?: string | null
          criado_em?: string
          horario_realizacao?: string | null
          id?: string
          municipio?: string | null
          nome?: string | null
          projeto_id: string
          turno?: string | null
        }
        Update: {
          atualizado_em?: string
          codigo?: string | null
          codigo_turma?: string | null
          criado_em?: string
          horario_realizacao?: string | null
          id?: string
          municipio?: string | null
          nome?: string | null
          projeto_id?: string
          turno?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "turmas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          ativo: boolean
          criado_em: string
          id: string
          projeto_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          ativo?: boolean
          criado_em?: string
          id?: string
          projeto_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          ativo?: boolean
          criado_em?: string
          id?: string
          projeto_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
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
      has_role_any: {
        Args: { _roles: string[]; _user_id: string }
        Returns: boolean
      }
      is_project_admin: {
        Args: { _projeto_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "coordenador_geral"
        | "gestor_financeiro"
        | "administrativo"
        | "coordenador_pedagogico"
        | "professor"
        | "auxiliar_pedagogico"
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
      app_role: [
        "coordenador_geral",
        "gestor_financeiro",
        "administrativo",
        "coordenador_pedagogico",
        "professor",
        "auxiliar_pedagogico",
      ],
    },
  },
} as const
