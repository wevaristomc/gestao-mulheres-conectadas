import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  lerFichaInscricaoParaImpressao,
  type FichaInscricaoPrint,
} from "@/lib/ficha-inscricao-print";
import { formatCpf } from "@/lib/cpf";
import {
  AUTORIZACAO_DADOS_TEXTO,
  TURNO_PREFERIDO_LABEL,
  type TurnoPreferido,
} from "@/lib/inscricao-digital";

function turnoLabel(valor: string | undefined): string {
  if (!valor) return "";
  return TURNO_PREFERIDO_LABEL[valor as TurnoPreferido] ?? valor;
}

export const Route = createFileRoute("/imprimir-inscricao")({
  validateSearch: (search) => z.object({ chave: z.string().optional().default("") }).parse(search),
  head: () => ({ meta: [{ title: "Ficha de matrícula para impressão" }] }),
  component: FichaImpressaoPage,
});

function linha(label: string, value: unknown) {
  return (
    <div className="min-h-8 border-b border-dotted border-black pb-1 text-sm">
      <strong>{label}:</strong> {String(value || "")}
    </div>
  );
}

function FichaImpressaoPage() {
  const { chave } = Route.useSearch();
  const [ficha, setFicha] = useState<FichaInscricaoPrint | null>(null);
  useEffect(() => setFicha(lerFichaInscricaoParaImpressao(chave)), [chave]);
  if (!ficha)
    return <main className="p-8 text-center">Não foi possível recuperar os dados da ficha.</main>;
  const d = ficha.dados;
  return (
    <main className="mx-auto max-w-[210mm] bg-white p-6 text-black print:max-w-none print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 size-4" /> Imprimir / Salvar PDF
        </Button>
      </div>
      <article className="border-2 border-black p-7 font-sans print:border-0 print:p-4">
        <header className="mb-6 border-b-2 border-black pb-4 text-center">
          <p className="text-sm font-semibold uppercase">
            {ficha.projetoNome || "Mulheres Conectadas"}
          </p>
          <h1 className="mt-1 text-2xl font-bold uppercase">Ficha de matrícula</h1>
          <p className="mt-2 text-sm">Turma: {ficha.turmaNome}</p>
          {ficha.protocolo ? <p className="text-xs">Protocolo digital: {ficha.protocolo}</p> : null}
        </header>

        <section className="space-y-2 break-inside-avoid">
          <h2 className="font-bold uppercase">1. Elegibilidade e dados pessoais</h2>
          {linha("Identifica-se como mulher", d.identifica_se_mulher === "sim" ? "Sim" : "Não")}
          {linha("Nome completo", d.nome)}
          <div className="grid grid-cols-2 gap-5">
            {linha("CPF", formatCpf(d.cpf))}
            {linha("Data de nascimento", d.data_nascimento)}
            {linha("Gênero", d.genero)}
            {linha("Raça/cor", d.raca)}
          </div>
        </section>

        <section className="mt-5 space-y-2 break-inside-avoid">
          <h2 className="font-bold uppercase">2. Contato, endereço e preferência</h2>
          <div className="grid grid-cols-2 gap-5">
            {linha("Telefone/WhatsApp", d.telefone)}
            {linha("E-mail", d.email)}
          </div>
          {linha("Endereço completo", d.endereco)}
          <div className="grid grid-cols-2 gap-5">
            {linha("Município", d.municipio)}
            {linha("Bairro ou ponto de referência", d.bairro_referencia)}
            {linha("Turno de preferência", turnoLabel(d.turno_preferido))}
            {linha("Disponível em outros turnos", d.disponibilidade_outros_turnos ? "Sim" : "Não")}
            {linha("NIS", d.nis)}
            {linha("Tamanho da camisa", d.tamanho_camisa)}
          </div>
        </section>

        <section className="mt-5 space-y-2 break-inside-avoid">
          <h2 className="font-bold uppercase">3. Perfil socioeconômico</h2>
          <div className="grid grid-cols-2 gap-5">
            {linha("Situação de trabalho", d.situacao_trabalho)}
            {linha("Renda familiar", d.renda_familiar)}
            {linha("Pessoa com deficiência (PCD)", d.pcd ? "Sim" : "Não")}
            {linha("Tipo de deficiência", d.tipo_deficiencia)}
            {linha(
              "Beneficiária de programa social",
              d.beneficiaria_programa_social ? "Sim" : "Não",
            )}
            {linha("Programa social", d.qual_programa_social)}
          </div>
          {linha("Motivo para participar do curso", d.motivo_participacao)}
        </section>

        <section className="mt-5 space-y-2 break-inside-avoid">
          <h2 className="font-bold uppercase">4. Saúde e contatos de emergência</h2>
          {linha("Restrição alimentar", d.restricao_alimentar ? "Sim" : "Não")}
          {linha("Qual restrição", d.qual_restricao_alimentar)}
          {d.contatos_emergencia.map((contato, indice) => (
            <div key={indice} className="grid grid-cols-3 gap-5">
              {linha(`Contato ${indice + 1} — nome`, contato.nome)}
              {linha("Telefone", contato.telefone)}
              {linha("Parentesco/relação", contato.parentesco)}
            </div>
          ))}
        </section>

        <section className="mt-5 space-y-2 break-inside-avoid">
          <h2 className="font-bold uppercase">5. Dados bancários</h2>
          <div className="grid grid-cols-3 gap-5">
            {linha("Banco", d.banco)}
            {linha("Agência", d.agencia)}
            {linha("Conta", d.conta)}
          </div>
          {linha("Observações", d.observacoes)}
        </section>

        <section className="mt-7 break-inside-avoid text-xs leading-relaxed">
          <h2 className="mb-2 font-bold uppercase">6. Autorização de dados</h2>
          <p>
            <strong>{d.autorizacao_dados ? "(X) Sim, autorizo." : "( ) Sim, autorizo."}</strong>{" "}
            {AUTORIZACAO_DADOS_TEXTO}
          </p>
          {d.autorizacao_dados_em ? (
            <p className="mt-1">
              Consentimento digital registrado em:{" "}
              {new Date(d.autorizacao_dados_em).toLocaleString("pt-BR")}
            </p>
          ) : null}
          <p className="mt-5">
            Declaro que as informações acima são verdadeiras e estou ciente das regras de
            participação e da obrigatoriedade desta ficha física assinada.
          </p>
          <div className="mt-16 grid grid-cols-2 gap-16 text-center text-sm">
            <div className="border-t border-black pt-2">Assinatura da aluna</div>
            <div className="border-t border-black pt-2">Responsável pela matrícula</div>
          </div>
          <div className="mt-12 border-t border-black pt-2 text-center text-sm">Local e data</div>
        </section>
      </article>
    </main>
  );
}
