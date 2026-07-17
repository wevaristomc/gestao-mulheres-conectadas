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
      aulas: {
        Row: {
          assunto: string | null
          ch: number | null
          ch_ministrada: number | null
          ch_prevista: number | null
          conteudo: string | null
          conteudo_programatico: string | null
          created_at: string
          data: string | null
          duracao: number | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          instrutor: string | null
          observacoes: string | null
          ordem: number | null
          tema: string | null
          tipo_ch: string | null
          titulo: string | null
          turma_id: string
          updated_at: string
        }
        Insert: {
          assunto?: string | null
          ch?: number | null
          ch_ministrada?: number | null
          ch_prevista?: number | null
          conteudo?: string | null
          conteudo_programatico?: string | null
          created_at?: string
          data?: string | null
          duracao?: number | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          instrutor?: string | null
          observacoes?: string | null
          ordem?: number | null
          tema?: string | null
          tipo_ch?: string | null
          titulo?: string | null
          turma_id: string
          updated_at?: string
        }
        Update: {
          assunto?: string | null
          ch?: number | null
          ch_ministrada?: number | null
          ch_prevista?: number | null
          conteudo?: string | null
          conteudo_programatico?: string | null
          created_at?: string
          data?: string | null
          duracao?: number | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          instrutor?: string | null
          observacoes?: string | null
          ordem?: number | null
          tema?: string | null
          tipo_ch?: string | null
          titulo?: string | null
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aulas_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiarias: {
        Row: {
          agencia: string | null
          banco: string | null
          beneficiaria_programa_social: boolean | null
          conta: string | null
          cpf: string | null
          created_at: string
          data_nascimento: string | null
          email: string | null
          endereco: string | null
          genero: string | null
          id: string
          municipio: string | null
          nis: string | null
          nome: string
          pcd: boolean | null
          qual_programa_social: string | null
          raca: string | null
          telefone: string | null
          tipo_deficiencia: string | null
          updated_at: string
        }
        Insert: {
          agencia?: string | null
          banco?: string | null
          beneficiaria_programa_social?: boolean | null
          conta?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          genero?: string | null
          id?: string
          municipio?: string | null
          nis?: string | null
          nome: string
          pcd?: boolean | null
          qual_programa_social?: string | null
          raca?: string | null
          telefone?: string | null
          tipo_deficiencia?: string | null
          updated_at?: string
        }
        Update: {
          agencia?: string | null
          banco?: string | null
          beneficiaria_programa_social?: boolean | null
          conta?: string | null
          cpf?: string | null
          created_at?: string
          data_nascimento?: string | null
          email?: string | null
          endereco?: string | null
          genero?: string | null
          id?: string
          municipio?: string | null
          nis?: string | null
          nome?: string
          pcd?: boolean | null
          qual_programa_social?: string | null
          raca?: string | null
          telefone?: string | null
          tipo_deficiencia?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cursistas: {
        Row: {
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          municipio: string | null
          nome: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          municipio?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          municipio?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      despesas: {
        Row: {
          created_at: string
          data: string | null
          descricao: string | null
          fornecedor_id: string | null
          id: string
          orcamento_item_id: string | null
          projeto_id: string
          status: string | null
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string | null
          descricao?: string | null
          fornecedor_id?: string | null
          id?: string
          orcamento_item_id?: string | null
          projeto_id: string
          status?: string | null
          updated_at?: string
          valor?: number
        }
        Update: {
          created_at?: string
          data?: string | null
          descricao?: string | null
          fornecedor_id?: string | null
          id?: string
          orcamento_item_id?: string | null
          projeto_id?: string
          status?: string | null
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_fornecedor_id_fkey"
            columns: ["fornecedor_id"]
            isOneToOne: false
            referencedRelation: "fornecedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_orcamento_item_id_fkey"
            columns: ["orcamento_item_id"]
            isOneToOne: false
            referencedRelation: "orcamento_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      evidencias: {
        Row: {
          arquivo_nome: string | null
          arquivo_url: string
          aula_id: string | null
          created_at: string
          descricao: string | null
          enviado_por: string | null
          id: string
          tipo: string
          turma_id: string | null
          updated_at: string
        }
        Insert: {
          arquivo_nome?: string | null
          arquivo_url: string
          aula_id?: string | null
          created_at?: string
          descricao?: string | null
          enviado_por?: string | null
          id?: string
          tipo: string
          turma_id?: string | null
          updated_at?: string
        }
        Update: {
          arquivo_nome?: string | null
          arquivo_url?: string
          aula_id?: string | null
          created_at?: string
          descricao?: string | null
          enviado_por?: string | null
          id?: string
          tipo?: string
          turma_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "evidencias_aula_id_fkey"
            columns: ["aula_id"]
            isOneToOne: false
            referencedRelation: "aulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidencias_turma_id_fkey"
            columns: ["turma_id"]
            isOneToOne: false
            referencedRelation: "turmas"
            referencedColumns: ["id"]
          },
        ]
      }
      fornecedores: {
        Row: {
          cnpj: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          projeto_id: string
          telefone: string | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          projeto_id: string
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          projeto_id?: string
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fornecedores_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
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
      matriculas: {
        Row: {
          assinou_lista: boolean | null
          beneficiaria_id: string | null
          certificado_emitido_em: string | null
          certificado_url: string | null
          created_at: string
          cursista_id: string | null
          data_conclusao: string | null
          data_inscricao: string | null
          ficha_inscricao_url: string | null
          frequencia_percentual: number | null
          id: string
          motivo_evasao: string | null
          observacao_importacao: string | null
          status: string | null
          turma_id: string
          updated_at: string
        }
        Insert: {
          assinou_lista?: boolean | null
          beneficiaria_id?: string | null
          certificado_emitido_em?: string | null
          certificado_url?: string | null
          created_at?: string
          cursista_id?: string | null
          data_conclusao?: string | null
          data_inscricao?: string | null
          ficha_inscricao_url?: string | null
          frequencia_percentual?: number | null
          id?: string
          motivo_evasao?: string | null
          observacao_importacao?: string | null
          status?: string | null
          turma_id: string
          updated_at?: string
        }
        Update: {
          assinou_lista?: boolean | null
          beneficiaria_id?: string | null
          certificado_emitido_em?: string | null
          certificado_url?: string | null
          created_at?: string
          cursista_id?: string | null
          data_conclusao?: string | null
          data_inscricao?: string | null
          ficha_inscricao_url?: string | null
          frequencia_percentual?: number | null
          id?: string
          motivo_evasao?: string | null
          observacao_importacao?: string | null
          status?: string | null
          turma_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matriculas_beneficiaria_id_fkey"
            columns: ["beneficiaria_id"]
            isOneToOne: false
            referencedRelation: "beneficiarias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_cursista_id_fkey"
            columns: ["cursista_id"]
            isOneToOne: false
            referencedRelation: "cursistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matriculas_turma_id_fkey"
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
      orcamento_itens: {
        Row: {
          categoria: string | null
          created_at: string
          descricao: string | null
          id: string
          projeto_id: string
          updated_at: string
          valor_executado: number
          valor_previsto: number
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          projeto_id: string
          updated_at?: string
          valor_executado?: number
          valor_previsto?: number
        }
        Update: {
          categoria?: string | null
          created_at?: string
          descricao?: string | null
          id?: string
          projeto_id?: string
          updated_at?: string
          valor_executado?: number
          valor_previsto?: number
        }
        Relationships: [
          {
            foreignKeyName: "orcamento_itens_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
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
      presencas: {
        Row: {
          aula_id: string
          created_at: string
          id: string
          justificativa: string | null
          matricula_id: string
          presente: boolean
          updated_at: string
        }
        Insert: {
          aula_id: string
          created_at?: string
          id?: string
          justificativa?: string | null
          matricula_id: string
          presente?: boolean
          updated_at?: string
        }
        Update: {
          aula_id?: string
          created_at?: string
          id?: string
          justificativa?: string | null
          matricula_id?: string
          presente?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "presencas_aula_id_fkey"
            columns: ["aula_id"]
            isOneToOne: false
            referencedRelation: "aulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
        ]
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
      rubricas: {
        Row: {
          categoria: string | null
          codigo: string | null
          created_at: string
          id: string
          nome: string | null
          projeto_id: string
          updated_at: string
          valor_previsto: number
        }
        Insert: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          projeto_id: string
          updated_at?: string
          valor_previsto?: number
        }
        Update: {
          categoria?: string | null
          codigo?: string | null
          created_at?: string
          id?: string
          nome?: string | null
          projeto_id?: string
          updated_at?: string
          valor_previsto?: number
        }
        Relationships: [
          {
            foreignKeyName: "rubricas_projeto_id_fkey"
            columns: ["projeto_id"]
            isOneToOne: false
            referencedRelation: "projetos"
            referencedColumns: ["id"]
          },
        ]
      }
      turmas: {
        Row: {
          atualizado_em: string
          ch_conhecimentos_especificos: number | null
          ch_conhecimentos_gerais: number | null
          ch_total: number | null
          ciclo: number | null
          codigo: string | null
          codigo_turma: string | null
          contato_local_nome: string | null
          contato_local_telefone: string | null
          created_at: string
          criado_em: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          dias_semana: string | null
          executora: string | null
          horario_realizacao: string | null
          id: string
          instrumento_id: string | null
          local_endereco: string | null
          local_id: string | null
          municipio: string | null
          nome: string | null
          nome_curso: string | null
          observacoes: string | null
          projeto_id: string
          qtd_dias_curso: number | null
          titulo: string | null
          turno: string | null
          updated_at: string
          vagas: number | null
        }
        Insert: {
          atualizado_em?: string
          ch_conhecimentos_especificos?: number | null
          ch_conhecimentos_gerais?: number | null
          ch_total?: number | null
          ciclo?: number | null
          codigo?: string | null
          codigo_turma?: string | null
          contato_local_nome?: string | null
          contato_local_telefone?: string | null
          created_at?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          dias_semana?: string | null
          executora?: string | null
          horario_realizacao?: string | null
          id?: string
          instrumento_id?: string | null
          local_endereco?: string | null
          local_id?: string | null
          municipio?: string | null
          nome?: string | null
          nome_curso?: string | null
          observacoes?: string | null
          projeto_id: string
          qtd_dias_curso?: number | null
          titulo?: string | null
          turno?: string | null
          updated_at?: string
          vagas?: number | null
        }
        Update: {
          atualizado_em?: string
          ch_conhecimentos_especificos?: number | null
          ch_conhecimentos_gerais?: number | null
          ch_total?: number | null
          ciclo?: number | null
          codigo?: string | null
          codigo_turma?: string | null
          contato_local_nome?: string | null
          contato_local_telefone?: string | null
          created_at?: string
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          dias_semana?: string | null
          executora?: string | null
          horario_realizacao?: string | null
          id?: string
          instrumento_id?: string | null
          local_endereco?: string | null
          local_id?: string | null
          municipio?: string | null
          nome?: string | null
          nome_curso?: string | null
          observacoes?: string | null
          projeto_id?: string
          qtd_dias_curso?: number | null
          titulo?: string | null
          turno?: string | null
          updated_at?: string
          vagas?: number | null
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
      frequencias: {
        Row: {
          aula_id: string | null
          id: string | null
          matricula_id: string | null
          presente: boolean | null
        }
        Insert: {
          aula_id?: string | null
          id?: string | null
          matricula_id?: string | null
          presente?: boolean | null
        }
        Update: {
          aula_id?: string | null
          id?: string | null
          matricula_id?: string | null
          presente?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "presencas_aula_id_fkey"
            columns: ["aula_id"]
            isOneToOne: false
            referencedRelation: "aulas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "presencas_matricula_id_fkey"
            columns: ["matricula_id"]
            isOneToOne: false
            referencedRelation: "matriculas"
            referencedColumns: ["id"]
          },
        ]
      }
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
