-- =====================================================================
-- Importação de Turmas/Alunas (CSV bancário) + Espelho Moodle/AVA
-- Rode este SQL diretamente no projeto yqvocpnvunaprpmhlswn
-- (SQL Editor do Supabase). Idempotente.
-- =====================================================================

-- 1) Campos bancários na beneficiária
ALTER TABLE public.beneficiarias
  ADD COLUMN IF NOT EXISTS banco text,
  ADD COLUMN IF NOT EXISTS agencia text,
  ADD COLUMN IF NOT EXISTS conta text;

-- 2) Campos na matrícula
ALTER TABLE public.matriculas
  ADD COLUMN IF NOT EXISTS assinou_lista boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS observacao_importacao text;

-- Deduplica antes de criar índice único (turma_id, beneficiaria_id)
WITH d AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY turma_id, beneficiaria_id
           ORDER BY created_at DESC NULLS LAST, id
         ) AS rn
    FROM public.matriculas
   WHERE turma_id IS NOT NULL AND beneficiaria_id IS NOT NULL
)
DELETE FROM public.matriculas m USING d WHERE m.id = d.id AND d.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS matriculas_turma_beneficiaria_uidx
  ON public.matriculas (turma_id, beneficiaria_id);

-- 3) Tabelas espelho AVA (Moodle)

CREATE TABLE IF NOT EXISTS public.ava_users (
  moodle_id       bigint PRIMARY KEY,
  username        text,
  idnumber        text,
  email           text,
  firstname       text,
  lastname        text,
  cpf             text,
  lastaccess      timestamptz,
  beneficiaria_id uuid REFERENCES public.beneficiarias(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_users TO authenticated;
GRANT ALL ON public.ava_users TO service_role;
ALTER TABLE public.ava_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_users" ON public.ava_users;
CREATE POLICY "auth manage ava_users" ON public.ava_users FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ava_users_cpf_idx ON public.ava_users (cpf);
CREATE INDEX IF NOT EXISTS ava_users_beneficiaria_idx ON public.ava_users (beneficiaria_id);

CREATE TABLE IF NOT EXISTS public.ava_courses (
  moodle_id  bigint PRIMARY KEY,
  shortname  text,
  fullname   text,
  category   bigint,
  startdate  timestamptz,
  enddate    timestamptz,
  turma_id   uuid REFERENCES public.turmas(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_courses TO authenticated;
GRANT ALL ON public.ava_courses TO service_role;
ALTER TABLE public.ava_courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_courses" ON public.ava_courses;
CREATE POLICY "auth manage ava_courses" ON public.ava_courses FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ava_courses_shortname_idx ON public.ava_courses (upper(shortname));
CREATE INDEX IF NOT EXISTS ava_courses_turma_idx ON public.ava_courses (turma_id);

CREATE TABLE IF NOT EXISTS public.ava_enrolments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moodle_id     bigint UNIQUE,
  ava_user_id   bigint REFERENCES public.ava_users(moodle_id) ON DELETE CASCADE,
  ava_course_id bigint REFERENCES public.ava_courses(moodle_id) ON DELETE CASCADE,
  status        integer,
  timestart     timestamptz,
  timeend       timestamptz,
  timecreated   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_enrolments TO authenticated;
GRANT ALL ON public.ava_enrolments TO service_role;
ALTER TABLE public.ava_enrolments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_enrolments" ON public.ava_enrolments;
CREATE POLICY "auth manage ava_enrolments" ON public.ava_enrolments FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ava_enrolments_user_idx ON public.ava_enrolments (ava_user_id);
CREATE INDEX IF NOT EXISTS ava_enrolments_course_idx ON public.ava_enrolments (ava_course_id);

CREATE TABLE IF NOT EXISTS public.ava_activities (
  moodle_cmid        bigint PRIMARY KEY,
  ava_course_id      bigint REFERENCES public.ava_courses(moodle_id) ON DELETE CASCADE,
  modulename         text,
  instance_id        bigint,
  nome               text,
  completion_enabled boolean,
  created_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_activities TO authenticated;
GRANT ALL ON public.ava_activities TO service_role;
ALTER TABLE public.ava_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_activities" ON public.ava_activities;
CREATE POLICY "auth manage ava_activities" ON public.ava_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ava_activities_course_idx ON public.ava_activities (ava_course_id);

CREATE TABLE IF NOT EXISTS public.ava_completions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ava_user_id     bigint REFERENCES public.ava_users(moodle_id) ON DELETE CASCADE,
  ava_activity_id bigint REFERENCES public.ava_activities(moodle_cmid) ON DELETE CASCADE,
  completionstate integer,
  timemodified    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ava_user_id, ava_activity_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_completions TO authenticated;
GRANT ALL ON public.ava_completions TO service_role;
ALTER TABLE public.ava_completions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_completions" ON public.ava_completions;
CREATE POLICY "auth manage ava_completions" ON public.ava_completions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.ava_grades (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ava_user_id   bigint REFERENCES public.ava_users(moodle_id) ON DELETE CASCADE,
  grade_item_id bigint NOT NULL,
  ava_course_id bigint REFERENCES public.ava_courses(moodle_id) ON DELETE SET NULL,
  itemname      text,
  itemtype      text,
  finalgrade    numeric,
  rawgrademax   numeric,
  timemodified  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ava_user_id, grade_item_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_grades TO authenticated;
GRANT ALL ON public.ava_grades TO service_role;
ALTER TABLE public.ava_grades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_grades" ON public.ava_grades;
CREATE POLICY "auth manage ava_grades" ON public.ava_grades FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS ava_grades_course_idx ON public.ava_grades (ava_course_id);

CREATE TABLE IF NOT EXISTS public.ava_importacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path  text NOT NULL,
  arquivo_nome  text,
  tamanho_bytes bigint,
  iniciado_em   timestamptz NOT NULL DEFAULT now(),
  terminado_em  timestamptz,
  status        text NOT NULL DEFAULT 'iniciado',
  resumo        jsonb NOT NULL DEFAULT '{}'::jsonb,
  erro          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ava_importacoes TO authenticated;
GRANT ALL ON public.ava_importacoes TO service_role;
ALTER TABLE public.ava_importacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth manage ava_importacoes" ON public.ava_importacoes;
CREATE POLICY "auth manage ava_importacoes" ON public.ava_importacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);