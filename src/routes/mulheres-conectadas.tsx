import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  Code2,
  GraduationCap,
  HeartHandshake,
  Laptop,
  MapPin,
  MonitorCog,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";

import { DepoimentoCard } from "@/components/landing/depoimento-card";
import { listarTurmasInscricaoPublica } from "@/lib/inscricoes-digitais.functions";
import { listarLandingDepoimentos } from "@/lib/landing-depoimentos.functions";
import { ORIGEM_PUBLICA } from "@/lib/site";

const DEPOIMENTOS_FALLBACK = [
  {
    nome: "Andressa",
    contexto: "Aluna · Juatuba · Tarde",
    videoUrl: "/depoimentos/andressa-juatuba-tarde.mp4",
  },
  { nome: "Camila", contexto: "Aluna do projeto", videoUrl: "/depoimentos/camila.mp4" },
  { nome: "Deisiane", contexto: "Aluna do projeto", videoUrl: "/depoimentos/deisiane.mp4" },
  { nome: "Elisangela", contexto: "Aluna do projeto", videoUrl: "/depoimentos/elisangela.mp4" },
  { nome: "Ivete", contexto: "Aluna do projeto", videoUrl: "/depoimentos/ivete.mp4" },
] as const;

const TRILHAS = [
  {
    horas: "40h",
    titulo: "Formação Digital",
    texto:
      "Letramento digital, comunicação, raciocínio lógico, cidadania, relações de trabalho e uso seguro da tecnologia.",
    icon: Laptop,
  },
  {
    horas: "55h",
    titulo: "Suporte de TI",
    texto:
      "Sistemas operacionais, hardware, redes locais, atendimento ao usuário, segurança, backup e privacidade.",
    icon: MonitorCog,
  },
  {
    horas: "55h",
    titulo: "Programação Web",
    texto:
      "Fundamentos para construir soluções web, desenvolver o raciocínio de programação e apresentar projetos.",
    icon: Code2,
  },
] as const;

export const Route = createFileRoute("/mulheres-conectadas")({
  head: () => ({
    meta: [
      { title: "Mulheres Conectadas · Formação gratuita em tecnologia" },
      {
        name: "description",
        content:
          "Formação gratuita de 150 horas em tecnologia e inovação digital para mulheres de Belo Horizonte, Betim e Juatuba.",
      },
      { property: "og:title", content: "Mulheres Conectadas" },
      {
        property: "og:description",
        content:
          "Tecnologia para ampliar caminhos: formação digital, suporte de TI e programação web para mulheres.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${ORIGEM_PUBLICA}/mulheres-conectadas` },
      {
        property: "og:image",
        content: `${ORIGEM_PUBLICA}/marca/og-mulheres-conectadas.png`,
      },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      {
        property: "og:image:alt",
        content: "Mulher desenvolvendo habilidades digitais no projeto Mulheres Conectadas",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "Mulheres Conectadas · Formação gratuita em tecnologia",
      },
      {
        name: "twitter:description",
        content:
          "Tecnologia para ampliar caminhos: formação digital, suporte de TI e programação web para mulheres.",
      },
      {
        name: "twitter:image",
        content: `${ORIGEM_PUBLICA}/marca/og-mulheres-conectadas.png`,
      },
      {
        name: "twitter:image:alt",
        content: "Mulher desenvolvendo habilidades digitais no projeto Mulheres Conectadas",
      },
    ],
  }),
  component: MulheresConectadasLanding,
});

function MulheresConectadasLanding() {
  const turmasQ = useQuery({
    queryKey: ["landing-publica", "turmas"],
    queryFn: () => listarTurmasInscricaoPublica(),
    staleTime: 5 * 60 * 1000,
  });
  const depoimentosQ = useQuery({
    queryKey: ["landing-publica", "depoimentos"],
    queryFn: () => listarLandingDepoimentos(),
    staleTime: 5 * 60 * 1000,
  });
  const depoimentos = depoimentosQ.data?.length ? depoimentosQ.data : DEPOIMENTOS_FALLBACK;

  const municipios = useMemo(() => {
    const encontrados = new Set(
      (turmasQ.data ?? []).map((turma) => turma.municipio?.trim()).filter(Boolean),
    );
    return encontrados.size ? Array.from(encontrados) : ["Belo Horizonte", "Betim", "Juatuba"];
  }, [turmasQ.data]);

  return (
    <main className="min-h-screen bg-[#fffaf0] text-[#05244d] selection:bg-[#f5b033] selection:text-[#05244d]">
      <a
        href="#conteudo"
        className="fixed left-3 top-3 z-[100] -translate-y-24 rounded-full bg-white px-4 py-2 font-semibold text-[#05244d] shadow-lg transition focus:translate-y-0"
      >
        Ir para o conteúdo
      </a>

      <header className="sticky top-0 z-50 border-b border-[#05244d]/10 bg-[#fffaf0]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
          <Link to="/mulheres-conectadas" aria-label="Início - Mulheres Conectadas">
            <img
              src="/marca/logo-pmq-horizontal.png"
              alt="Programa Manuel Querino de Qualificação Social e Profissional"
              className="h-11 w-auto object-contain sm:h-12"
            />
          </Link>

          <nav
            className="hidden items-center gap-7 text-sm font-semibold lg:flex"
            aria-label="Principal"
          >
            <a className="transition hover:text-[#d15c2e]" href="#projeto">
              O projeto
            </a>
            <a className="transition hover:text-[#d15c2e]" href="#formacao">
              A formação
            </a>
            <a className="transition hover:text-[#d15c2e]" href="#depoimentos">
              Depoimentos
            </a>
            <a className="transition hover:text-[#d15c2e]" href="#inscricao">
              Como participar
            </a>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              className="hidden rounded-full px-3 py-2 text-sm font-semibold transition hover:bg-[#05244d]/5 sm:inline-flex"
            >
              Acesso da equipe
            </Link>
            <Link
              to="/inscricao"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#d15c2e] px-5 text-sm font-bold text-white shadow-[0_8px_24px_rgba(209,92,46,0.24)] transition hover:-translate-y-0.5 hover:bg-[#b94c26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#05244d]"
            >
              Inscreva-se <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      <div id="conteudo">
        <section className="relative isolate overflow-hidden bg-[#05244d] text-white">
          <div
            className="absolute inset-0 -z-20 opacity-30"
            style={{
              backgroundImage:
                "radial-gradient(circle at 10% 20%, #f5b033 0 2px, transparent 3px), radial-gradient(circle at 75% 30%, #d15c2e 0 2px, transparent 3px)",
              backgroundSize: "42px 42px, 62px 62px",
            }}
          />
          <div className="absolute -right-32 -top-32 -z-10 size-[34rem] rounded-full border-[6rem] border-[#f5b033]/15" />
          <div className="absolute -bottom-40 left-[45%] -z-10 size-[30rem] rotate-12 rounded-[6rem] bg-[#d15c2e]/15" />

          <div className="mx-auto grid min-h-[680px] max-w-7xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:px-8 lg:py-24">
            <div>
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#f5b033]">
                <Sparkles className="size-4" /> Formação, autonomia e novos caminhos
              </div>
              <h1 className="max-w-4xl font-display text-5xl font-bold leading-[1.02] tracking-[-0.04em] sm:text-6xl lg:text-7xl">
                Tecnologia para transformar possibilidades em futuro.
              </h1>
              <p className="mt-7 max-w-2xl text-lg leading-8 text-white/78 sm:text-xl">
                O Mulheres Conectadas oferece formação gratuita em tecnologia e inovação digital
                para mulheres de Belo Horizonte, Betim e Juatuba, com aprendizado prático,
                acolhimento e conexão com o mundo do trabalho.
              </p>
              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link
                  to="/inscricao"
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f5b033] px-7 font-bold text-[#05244d] shadow-[0_14px_36px_rgba(245,176,51,0.22)] transition hover:-translate-y-0.5 hover:bg-[#ffc24d] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
                >
                  Quero fazer minha inscrição <ArrowRight className="size-5" />
                </Link>
                <a
                  href="#formacao"
                  className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/30 px-7 font-semibold transition hover:bg-white/10"
                >
                  Conhecer a formação
                </a>
              </div>
              <p className="mt-5 flex items-start gap-2 text-sm leading-6 text-white/65">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#f5b033]" />A inscrição é
                gratuita e passa por análise. O envio do formulário não garante a vaga.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -inset-4 rotate-3 rounded-[2.5rem] border border-[#f5b033]/45" />
              <div className="relative overflow-hidden rounded-[2.25rem] border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur md:p-7">
                <div className="grid grid-cols-2 gap-4">
                  <MetricCard value="150h" label="de formação híbrida" icon={Clock3} />
                  <MetricCard value="600" label="mulheres nos dois ciclos" icon={Users} />
                  <MetricCard value="12" label="turmas previstas" icon={GraduationCap} />
                  <MetricCard
                    value="75%"
                    label="frequência para certificação"
                    icon={CheckCircle2}
                  />
                </div>
                <div className="mt-5 rounded-2xl bg-[#f5b033] p-5 text-[#05244d]">
                  <p className="text-xs font-bold uppercase tracking-[0.15em]">
                    Qualificação profissional
                  </p>
                  <p className="mt-2 font-display text-2xl font-bold leading-tight">
                    Formação Digital + Suporte de TI + Programação Web
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-b border-[#05244d]/10 bg-white py-7"
          aria-label="Abrangência do projeto"
        >
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-4 sm:px-6 md:flex-row lg:px-8">
            <p className="text-center text-sm font-bold uppercase tracking-[0.16em] text-[#6e3300] md:text-left">
              Presença na Região Metropolitana de Belo Horizonte
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {municipios.map((municipio) => (
                <span
                  key={municipio}
                  className="inline-flex items-center gap-2 rounded-full bg-[#fff5de] px-4 py-2 text-sm font-semibold"
                >
                  <MapPin className="size-4 text-[#d15c2e]" /> {municipio}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section id="projeto" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-[.9fr_1.1fr] lg:px-8">
            <div>
              <SectionEyebrow>O projeto</SectionEyebrow>
              <h2 className="mt-4 max-w-xl font-display text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                Mais mulheres preparadas para ocupar o presente digital.
              </h2>
            </div>
            <div className="space-y-7 text-lg leading-8 text-[#05244d]/75">
              <p>
                Mulheres Conectadas é uma ação de qualificação social e profissional que aproxima
                mulheres em situação de vulnerabilidade das competências mais usadas na vida digital
                e em áreas de tecnologia.
              </p>
              <p>
                A proposta combina conhecimento, prática e acompanhamento para fortalecer a
                autonomia, ampliar possibilidades de inserção produtiva e reduzir desigualdades de
                gênero no setor tecnológico.
              </p>
              <div className="grid gap-4 pt-2 sm:grid-cols-2">
                <Feature icon={HeartHandshake} title="Acolhimento e permanência">
                  Materiais, transporte e lanche estão previstos no plano de trabalho para apoiar a
                  participação, conforme as regras da execução.
                </Feature>
                <Feature icon={BriefcaseBusiness} title="Conexão com oportunidades">
                  Desenvolvimento de competências alinhadas a Programação Web e Suporte de TI, sem
                  promessa de contratação.
                </Feature>
              </div>
            </div>
          </div>
        </section>

        <section id="formacao" className="scroll-mt-24 bg-[#fff5de] py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <SectionEyebrow>Sua jornada de aprendizagem</SectionEyebrow>
              <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                150 horas para aprender, praticar e avançar.
              </h2>
              <p className="mt-5 text-lg leading-8 text-[#05244d]/70">
                A matriz formativa é híbrida e reúne conhecimentos básicos e específicos, com
                atividades práticas e acompanhamento de frequência.
              </p>
            </div>
            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {TRILHAS.map((trilha, index) => (
                <article
                  key={trilha.titulo}
                  className="group relative overflow-hidden rounded-[2rem] border border-[#05244d]/10 bg-white p-7 shadow-[0_18px_60px_rgba(5,36,77,0.06)] transition hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(5,36,77,0.12)]"
                >
                  <div className="flex items-start justify-between">
                    <div className="grid size-14 place-items-center rounded-2xl bg-[#05244d] text-[#f5b033]">
                      <trilha.icon className="size-7" />
                    </div>
                    <span className="font-display text-3xl font-bold text-[#d15c2e]">
                      {trilha.horas}
                    </span>
                  </div>
                  <p className="mt-8 text-xs font-bold uppercase tracking-[0.16em] text-[#6e3300]/65">
                    Etapa {index + 1}
                  </p>
                  <h3 className="mt-2 font-display text-2xl font-bold">{trilha.titulo}</h3>
                  <p className="mt-4 leading-7 text-[#05244d]/70">{trilha.texto}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="depoimentos" className="scroll-mt-24 bg-white py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-3xl">
                <SectionEyebrow>Vozes do projeto</SectionEyebrow>
                <h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                  Histórias contadas por quem vive essa experiência.
                </h2>
              </div>
              <p className="flex max-w-sm items-center gap-2 text-sm leading-6 text-[#05244d]/65">
                <PlayCircle className="size-5 shrink-0 text-[#d15c2e]" />
                Use os controles de cada vídeo para assistir com som e em tela cheia.
              </p>
            </div>

            <div className="mt-12 flex snap-x snap-mandatory items-start gap-5 overflow-x-auto pb-6 [scrollbar-color:#d15c2e_#fff5de]">
              {depoimentos.map((depoimento) => (
                <DepoimentoCard
                  key={depoimento.videoUrl}
                  nome={depoimento.nome}
                  contexto={depoimento.contexto}
                  videoUrl={depoimento.videoUrl}
                />
              ))}
            </div>
          </div>
        </section>

        <section id="inscricao" className="scroll-mt-24 py-20 sm:py-28">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="overflow-hidden rounded-[2.5rem] bg-[#d15c2e] text-white shadow-[0_28px_90px_rgba(209,92,46,0.2)]">
              <div className="grid lg:grid-cols-[1.08fr_.92fr]">
                <div className="p-8 sm:p-12 lg:p-16">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#fff5de]">
                    Como participar
                  </p>
                  <h2 className="mt-4 max-w-2xl font-display text-4xl font-bold leading-tight tracking-[-0.03em] sm:text-5xl">
                    Sua inscrição começa agora.
                  </h2>
                  <p className="mt-5 max-w-2xl text-lg leading-8 text-white/80">
                    Preencha seus dados e informe suas preferências de turno e localização. A
                    coordenação analisa a inscrição e faz a alocação na turma mais adequada.
                  </p>
                  <div className="mt-8 grid gap-4 sm:grid-cols-3">
                    <Step
                      number="1"
                      title="Preencha"
                      text="Informe seus dados e suas preferências de turno e localização."
                    />
                    <Step
                      number="2"
                      title="Aguarde"
                      text="A coordenação analisa a inscrição e faz a alocação na turma."
                    />
                    <Step
                      number="3"
                      title="Assine"
                      text="Imprima e assine a ficha física obrigatória."
                    />
                  </div>
                </div>
                <div className="flex flex-col justify-center bg-[#05244d] p-8 sm:p-12 lg:p-14">
                  <p className="font-display text-2xl font-bold">Quem pode se inscrever?</p>
                  <ul className="mt-6 space-y-4 text-sm leading-6 text-white/80">
                    <Eligibility>Mulheres em situação de vulnerabilidade social.</Eligibility>
                    <Eligibility>Residentes em Belo Horizonte, Betim ou Juatuba.</Eligibility>
                    <Eligibility>
                      Pessoas com deficiência: 10% das vagas de cada turma são reservadas.
                    </Eligibility>
                  </ul>
                  <Link
                    to="/inscricao"
                    className="mt-9 inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-[#f5b033] px-7 font-bold text-[#05244d] transition hover:-translate-y-0.5 hover:bg-[#ffc24d]"
                  >
                    Abrir formulário de inscrição <ArrowRight className="size-5" />
                  </Link>
                  <p className="mt-4 text-center text-xs leading-5 text-white/55">
                    Inscrição sujeita à análise e à disponibilidade de vagas e turmas.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          className="border-y border-[#05244d]/10 bg-white py-14"
          aria-labelledby="marcas-heading"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <h2
              id="marcas-heading"
              className="text-center text-xs font-bold uppercase tracking-[0.18em] text-[#05244d]/55"
            >
              Programa, fomento e execução
            </h2>
            <div className="mt-8 grid items-center gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <BrandCard label="Programa">
                <img
                  src="/marca/logo-pmq-horizontal.png"
                  alt="Programa Manuel Querino"
                  className="max-h-16 max-w-full"
                />
              </BrandCard>
              <BrandCard label="Governo Federal e MTE">
                <img
                  src="/marca/governo-mte.png"
                  alt="Ministério do Trabalho e Emprego - Governo do Brasil"
                  className="max-h-20 max-w-full"
                />
              </BrandCard>
              <BrandCard label="Fundo de Amparo ao Trabalhador">
                <img
                  src="/marca/logo-fat-mte-vertical.png"
                  alt="Fundo de Amparo ao Trabalhador e Ministério do Trabalho e Emprego"
                  className="max-h-20 max-w-full"
                />
              </BrandCard>
              <BrandCard label="Execução">
                <img
                  src="/marca/quinta-arte.jpg"
                  alt="Quinta Arte"
                  className="max-h-20 max-w-full"
                />
              </BrandCard>
            </div>
          </div>
        </section>
      </div>

      <footer className="bg-[#05244d] py-12 text-white">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-8 px-4 sm:px-6 md:flex-row md:items-end lg:px-8">
          <div>
            <img
              src="/marca/logo-pmq-horizontal.png"
              alt="Programa Manuel Querino"
              className="h-12 w-auto rounded bg-white p-2"
            />
            <p className="mt-5 max-w-2xl text-sm leading-6 text-white/60">
              Mulheres Conectadas – Formação em Tecnologia e Inovação Digital. Projeto executado
              pela Quinta Arte no âmbito das políticas de qualificação social e profissional do
              Ministério do Trabalho e Emprego.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm font-semibold">
            <Link to="/inscricao" className="transition hover:text-[#f5b033]">
              Inscrição
            </Link>
            <Link to="/auth" className="transition hover:text-[#f5b033]">
              Acesso da equipe
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function MetricCard({
  value,
  label,
  icon: Icon,
}: {
  value: string;
  label: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#05244d]/45 p-4 sm:p-5">
      <Icon className="size-5 text-[#f5b033]" />
      <p className="mt-5 font-display text-3xl font-bold">{value}</p>
      <p className="mt-1 text-xs leading-5 text-white/65 sm:text-sm">{label}</p>
    </div>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#d15c2e]">
      <span className="h-0.5 w-8 bg-[#f5b033]" /> {children}
    </p>
  );
}

function Feature({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof HeartHandshake;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-[#05244d]/10 bg-white p-5 text-base leading-7 shadow-sm">
      <Icon className="size-6 text-[#d15c2e]" />
      <h3 className="mt-4 font-display text-xl font-bold text-[#05244d]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#05244d]/65">{children}</p>
    </article>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/10 p-4">
      <span className="grid size-8 place-items-center rounded-full bg-[#f5b033] text-sm font-bold text-[#05244d]">
        {number}
      </span>
      <p className="mt-4 font-display text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm leading-5 text-white/70">{text}</p>
    </div>
  );
}

function Eligibility({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[#f5b033]" />
      <span>{children}</span>
    </li>
  );
}

function BrandCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-[#05244d]/10 bg-white p-5">
      <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.15em] text-[#05244d]/45">
        {label}
      </p>
      <div className="flex min-h-20 items-center justify-center">{children}</div>
    </div>
  );
}
