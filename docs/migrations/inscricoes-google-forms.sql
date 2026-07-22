-- Suporte à importação de pré-inscrições exportadas do Google Forms.
-- Idempotente: ajusta a constraint de origem e semeia a política de IA do relatório.

begin;

do $origem$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.inscricoes_digitais'::regclass
      and conname = 'inscricoes_digitais_origem_check'
  ) then
    alter table public.inscricoes_digitais
      drop constraint inscricoes_digitais_origem_check;
  end if;

  alter table public.inscricoes_digitais
    add constraint inscricoes_digitais_origem_check
    check (origem in ('formulario', 'ocr', 'google_forms'));
end
$origem$;

insert into public.ia_politicas (
  processo,
  descricao,
  complexidade,
  provedor_preferido,
  max_tokens,
  temperatura,
  usar_fallback
)
values (
  'relatorio_inscricoes',
  'Analisa inscrições do Mulheres Conectadas por município, bairro, turno, status e oferta de turmas.',
  'media',
  null,
  1800,
  0.25,
  true
)
on conflict (processo) do update set
  descricao = excluded.descricao,
  complexidade = coalesce(public.ia_politicas.complexidade, excluded.complexidade),
  max_tokens = greatest(coalesce(public.ia_politicas.max_tokens, 0), excluded.max_tokens),
  temperatura = coalesce(public.ia_politicas.temperatura, excluded.temperatura),
  usar_fallback = coalesce(public.ia_politicas.usar_fallback, excluded.usar_fallback);

notify pgrst, 'reload schema';

commit;
