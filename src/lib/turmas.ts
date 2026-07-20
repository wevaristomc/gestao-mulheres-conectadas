type TurmaRotulavel = Record<string, unknown> | null | undefined;

function texto(turma: TurmaRotulavel, campo: string): string | null {
  const valor = turma?.[campo];
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function rotuloTurno(valor: string): string {
  const normalizado = valor.toLocaleLowerCase("pt-BR");
  const conhecidos: Record<string, string> = {
    manha: "Manhã",
    manhã: "Manhã",
    tarde: "Tarde",
    noite: "Noite",
    integral: "Integral",
    matutino: "Matutino",
    vespertino: "Vespertino",
    noturno: "Noturno",
  };
  return (
    conhecidos[normalizado] ?? `${valor.charAt(0).toLocaleUpperCase("pt-BR")}${valor.slice(1)}`
  );
}

export function codigoTurma(turma: TurmaRotulavel): string | null {
  return texto(turma, "codigo_turma") ?? texto(turma, "codigo");
}

/** Rótulo único para turmas em selects, tabelas e relatórios. Nunca exibe UUID. */
export function rotuloTurma(turma: TurmaRotulavel): string {
  const principal = codigoTurma(turma) ?? texto(turma, "nome_curso") ?? texto(turma, "curso");
  if (!principal) return "Turma sem identificação";

  const turno = texto(turma, "turno");
  const municipio = texto(turma, "municipio");
  return [principal, turno ? rotuloTurno(turno) : null, municipio]
    .filter((item): item is string => Boolean(item))
    .join(" · ");
}

export function compararTurmasPorCodigo(a: TurmaRotulavel, b: TurmaRotulavel): number {
  const codigoA = codigoTurma(a) ?? rotuloTurma(a);
  const codigoB = codigoTurma(b) ?? rotuloTurma(b);
  return codigoA.localeCompare(codigoB, "pt-BR", { numeric: true, sensitivity: "base" });
}
