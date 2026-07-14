// Validação e formatação de CPF (algoritmo oficial da Receita Federal).

export function onlyDigits(s: string): string {
  return (s ?? "").replace(/\D+/g, "");
}

export function formatCpf(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (d.length > 3) out += "." + p2;
  if (d.length > 6) out += "." + p3;
  if (d.length > 9) out += "-" + p4;
  return out;
}

export function isValidCpf(input: string): boolean {
  const cpf = onlyDigits(input);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (base: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < base.length; i += 1) {
      sum += parseInt(base[i], 10) * (factor - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  const d1 = calc(cpf.slice(0, 9), 10);
  const d2 = calc(cpf.slice(0, 10), 11);
  return d1 === parseInt(cpf[9], 10) && d2 === parseInt(cpf[10], 10);
}

// Aliases pt-BR (fonte única — usar estes em importadores/geradores/consultas).
// - normalizarCPF: remove tudo que não é dígito, retorna string bruta (pode ter <11).
// - formatarCPF:   aplica máscara 000.000.000-00 (parcial ao digitar).
// - validarCPF:    valida dígitos verificadores oficiais da Receita Federal.
export const normalizarCPF = onlyDigits;
export const formatarCPF = formatCpf;
export const validarCPF = isValidCpf;

export function formatPhone(input: string): string {
  const d = onlyDigits(input).slice(0, 11);
  if (d.length <= 10) {
    const p1 = d.slice(0, 2);
    const p2 = d.slice(2, 6);
    const p3 = d.slice(6, 10);
    let out = "";
    if (d.length > 0) out += "(" + p1;
    if (d.length >= 2) out += ") ";
    if (d.length > 2) out += p2;
    if (d.length > 6) out += "-" + p3;
    return out;
  }
  const p1 = d.slice(0, 2);
  const p2 = d.slice(2, 7);
  const p3 = d.slice(7, 11);
  return `(${p1}) ${p2}-${p3}`;
}