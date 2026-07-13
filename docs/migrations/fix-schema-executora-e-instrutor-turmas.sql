-- Corrige duas lacunas do schema no Supabase do projeto:
--  1) Colunas de Executora e parâmetros do projeto em public.projetos
--     (necessárias para a aba Configurações > Geral salvar).
--  2) Coluna projeto_id em public.instrutor_turmas
--     (necessária para a aba Configurações > Instrutores ↔ Turmas listar).
--
-- Idempotente: pode rodar quantas vezes precisar.

-- 1) Colunas de executora / parâmetros no projeto
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS executora_nome   text,
  ADD COLUMN IF NOT EXISTS cnpj             text,
  ADD COLUMN IF NOT EXISTS endereco         text,
  ADD COLUMN IF NOT EXISTS vigencia_inicio  date,
  ADD COLUMN IF NOT EXISTS vigencia_fim     date,
  ADD COLUMN IF NOT EXISTS valor_global     numeric,
  ADD COLUMN IF NOT EXISTS custo_aluno_hora numeric;

-- 2) projeto_id em instrutor_turmas, populado via turmas
ALTER TABLE public.instrutor_turmas
  ADD COLUMN IF NOT EXISTS projeto_id uuid REFERENCES public.projetos(id);

UPDATE public.instrutor_turmas it
   SET projeto_id = t.projeto_id
  FROM public.turmas t
 WHERE t.id = it.turma_id
   AND it.projeto_id IS NULL;

CREATE INDEX IF NOT EXISTS instrutor_turmas_projeto_id_idx
  ON public.instrutor_turmas(projeto_id);