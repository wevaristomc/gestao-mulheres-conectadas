-- Fase 2 — Vínculo dos áudios do WhatsApp já transcritos com a Base de
-- Conhecimento (documentos + documentos_chunks). Aditivo, idempotente.
-- JÁ APLICADO NO BANCO REAL (yqvocpnvunaprpmhlswn) pelo Cowork/Claude em
-- 2026-07 — este arquivo é apenas o espelho para revisão futura.
--
-- Nota da revisão manual: `wa_mensagem_id` foi criado como FK real para
-- `public.wa_mensagens(id) on delete set null`, em vez de uuid solto, para
-- que a exclusão de uma mensagem do WhatsApp não deixe registro órfão em
-- `documentos`. O documento publicado permanece, apenas perde o rastro
-- para a origem.

alter table public.documentos
  add column if not exists wa_mensagem_id uuid
    references public.wa_mensagens(id) on delete set null;

-- Índice único parcial: garante um único `documentos` por mensagem de áudio
-- (idempotência da publicação) sem impedir múltiplos documentos "não vindos
-- do WhatsApp" (wa_mensagem_id IS NULL).
create unique index if not exists documentos_wa_mensagem_uidx
  on public.documentos (wa_mensagem_id)
  where wa_mensagem_id is not null;

-- Política de IA para transcrição (Whisper). Reaproveitada por
-- `executarTranscricaoRouter` no fluxo do WhatsApp e no Orbe voz.
insert into public.ia_politicas
  (processo, descricao, complexidade, provedor_preferido, max_tokens, temperatura, usar_fallback)
values
  ('transcricao_audio',
   'Transcrição de áudios (Whisper). Usado por WhatsApp e Orbe voz.',
   'media', 'openai', 4096, 0, true)
on conflict (processo) do nothing;