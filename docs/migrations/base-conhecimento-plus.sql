-- Base de Conhecimento Expandida — anotações, áudios e RAG (indexação semântica).
-- Idempotente. Padrão do projeto: apenas colunas/tabelas aditivas em `documentos`
-- + nova tabela `documentos_chunks` para embeddings + RPC de busca.
-- Aplica em: banco externo (yqvocpnvunaprpmhlswn). NÃO usar Lovable Cloud.

create extension if not exists vector;

-- 1. Colunas aditivas em documentos ------------------------------------------
alter table public.documentos
  add column if not exists formato text not null default 'arquivo',
  add column if not exists origem text not null default 'upload',
  add column if not exists conteudo_texto text,
  add column if not exists transcricao_status text not null default 'pendente',
  add column if not exists duracao_segundos integer,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists tags text[] not null default '{}'::text[],
  -- Correção aplicada pelo Cowork (Claude) em 2026-07: RPC match_documentos_chunks
  -- referenciava d.titulo/d.categoria e essas colunas não existiam no schema real.
  -- Adicionadas de forma aditiva para manter compatibilidade com base já populada.
  add column if not exists titulo text,
  add column if not exists categoria text not null default 'outros';

-- Aceita formatos conhecidos; qualquer outro cai em 'arquivo'.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'documentos_formato_chk'
  ) then
    alter table public.documentos
      add constraint documentos_formato_chk
      check (formato in ('arquivo','anotacao','audio','link_externo'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'documentos_transcricao_status_chk'
  ) then
    alter table public.documentos
      add constraint documentos_transcricao_status_chk
      check (transcricao_status in ('pendente','processando','concluida','erro','nao_aplicavel'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'documentos_categoria_chk'
  ) then
    alter table public.documentos
      add constraint documentos_categoria_chk
      check (categoria in (
        'termo_fomento','modelos','normas','comunicacao','pedagogico',
        'relatorios_externos','anotacoes','audios_whatsapp','outros'
      ));
  end if;
end $$;

create index if not exists documentos_projeto_formato_idx
  on public.documentos (projeto_id, formato);
create index if not exists documentos_transcricao_status_idx
  on public.documentos (transcricao_status)
  where transcricao_status in ('pendente','processando','erro');

-- 2. Chunks / embeddings -----------------------------------------------------
create table if not exists public.documentos_chunks (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null references public.documentos(id) on delete cascade,
  projeto_id uuid not null,
  ordem integer not null default 0,
  texto text not null,
  tokens integer,
  embedding vector(1536),
  criado_em timestamptz not null default now()
);

grant select, insert, update, delete on public.documentos_chunks to authenticated;
grant all on public.documentos_chunks to service_role;

alter table public.documentos_chunks enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='documentos_chunks'
      and policyname='documentos_chunks_read'
  ) then
    create policy documentos_chunks_read on public.documentos_chunks
      for select to authenticated
      using (
        exists (select 1 from public.documentos d
                where d.id = documentos_chunks.documento_id
                  and d.projeto_id = documentos_chunks.projeto_id)
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='documentos_chunks'
      and policyname='documentos_chunks_write'
  ) then
    create policy documentos_chunks_write on public.documentos_chunks
      for all to authenticated
      using (
        exists (select 1 from public.documentos d
                where d.id = documentos_chunks.documento_id
                  and d.projeto_id = documentos_chunks.projeto_id)
      )
      with check (
        exists (select 1 from public.documentos d
                where d.id = documentos_chunks.documento_id
                  and d.projeto_id = documentos_chunks.projeto_id)
      );
  end if;
end $$;

-- Índice HNSW direto (vector(1536) cabe no limite de 2000 dims).
create index if not exists documentos_chunks_embedding_idx
  on public.documentos_chunks
  using hnsw (embedding vector_cosine_ops);

create index if not exists documentos_chunks_documento_idx
  on public.documentos_chunks (documento_id, ordem);

-- 3. RPC de busca ------------------------------------------------------------
create or replace function public.match_documentos_chunks(
  p_projeto_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer default 8,
  p_categorias text[] default null
)
returns table (
  chunk_id uuid,
  documento_id uuid,
  ordem integer,
  texto text,
  similarity float,
  titulo text,
  categoria text,
  formato text,
  storage_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id            as chunk_id,
    d.id            as documento_id,
    c.ordem,
    c.texto,
    1 - (c.embedding <=> p_query_embedding) as similarity,
    -- Correção Cowork/Claude 2026-07: d.nome / d.nome_arquivo não existem no
    -- schema real; fallback usa storage_path/drive_url/tipo.
    coalesce(d.titulo, d.storage_path, d.drive_url, d.tipo) as titulo,
    coalesce(d.categoria, d.tipo) as categoria,
    d.formato,
    d.storage_path
  from public.documentos_chunks c
  join public.documentos d on d.id = c.documento_id
  where c.projeto_id = p_projeto_id
    and c.embedding is not null
    and (p_categorias is null or coalesce(d.categoria, d.tipo) = any(p_categorias))
  order by c.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 8), 30));
$$;

-- Segurança (Cowork/Claude 2026-07): a função é SECURITY DEFINER e a base de
-- conhecimento pode conter CPFs, dados financeiros e transcrições de WhatsApp.
-- Advisor do Supabase apontou que `anon` poderia chamar via /rest/v1/rpc
-- contornando o requireSupabaseAuth. Revogamos public/anon e mantemos apenas
-- authenticated e service_role.
revoke all on function public.match_documentos_chunks(uuid, vector, integer, text[]) from public;
revoke all on function public.match_documentos_chunks(uuid, vector, integer, text[]) from anon;
grant execute on function public.match_documentos_chunks(uuid, vector, integer, text[]) to authenticated, service_role;