-- Amplia a ficha digital com anexos, perfil socioeconomico, emergencia e consentimento.
-- Idempotente: pode ser reexecutada sem apagar ou sobrescrever dados existentes.

begin;

alter table if exists public.inscricoes_digitais
  add column if not exists documento_path text,
  add column if not exists comprovante_path text;

alter table if exists public.beneficiarias
  add column if not exists tamanho_camisa text,
  add column if not exists restricao_alimentar text,
  add column if not exists situacao_trabalho text,
  add column if not exists renda_familiar text,
  add column if not exists motivo_participacao text,
  add column if not exists contatos_emergencia jsonb,
  add column if not exists autorizacao_dados boolean,
  add column if not exists autorizacao_dados_em timestamptz;

comment on column public.inscricoes_digitais.documento_path is
  'Path privado no bucket evidencias para o documento com foto da candidata.';
comment on column public.inscricoes_digitais.comprovante_path is
  'Path privado no bucket evidencias para o comprovante de endereco, quando enviado.';
comment on column public.beneficiarias.contatos_emergencia is
  'Lista de contatos adicionais para situacoes de saude ou emergencia.';
comment on column public.beneficiarias.autorizacao_dados_em is
  'Data e hora em que a candidata autorizou o tratamento dos dados.';

notify pgrst, 'reload schema';

commit;
