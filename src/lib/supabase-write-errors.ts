export type SupabaseWriteError = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function missingColumnFromError(error: SupabaseWriteError): string | null {
  const message = error.message ?? "";
  return (
    message.match(/Could not find the '([^']+)' column/i)?.[1] ??
    message.match(/column ["']?([a-zA-Z0-9_]+)["']? of relation/i)?.[1] ??
    message.match(/column (?:[a-zA-Z0-9_]+\.)?([a-zA-Z0-9_]+) does not exist/i)?.[1] ??
    null
  );
}

export function operationalWriteError(error: SupabaseWriteError, entityLabel: string): Error {
  const message = error.message ?? "Falha desconhecida";
  const code = error.code ?? "";

  if (code === "42501" || /row-level security|permission denied/i.test(message)) {
    return new Error(
      `Seu perfil não possui permissão para salvar ${entityLabel}. Verifique o papel e o projeto ativo.`,
    );
  }
  if (code === "42703" || code === "PGRST204" || missingColumnFromError(error)) {
    return new Error(
      `O banco de dados ainda não está alinhado ao formulário de ${entityLabel}. Execute a migração de correção das gravações operacionais.`,
    );
  }
  if (code === "23503") {
    return new Error(
      `Não foi possível salvar ${entityLabel}: a turma, matrícula, rubrica ou fornecedor selecionado não é mais válido.`,
    );
  }
  if (code === "23514") {
    return new Error(
      `Não foi possível salvar ${entityLabel}: um dos valores ou status não é aceito pelo banco.`,
    );
  }
  if (code === "23502") {
    const column = message.match(/column "([^"]+)"/)?.[1];
    return new Error(
      `Não foi possível salvar ${entityLabel}: o campo obrigatório${column ? ` “${column}”` : ""} não foi preenchido.`,
    );
  }
  return new Error(`Não foi possível salvar ${entityLabel}: ${message}`);
}
