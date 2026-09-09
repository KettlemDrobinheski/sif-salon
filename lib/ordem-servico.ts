/** Contador persistente, independente da exclusão de atendimentos. */
export const contadorOSPath = ["contadores", "atendimentos"] as const;

export function proximaOS(ultimaOS: unknown): number {
  if (typeof ultimaOS !== "number" || !Number.isSafeInteger(ultimaOS) || ultimaOS < 0) {
    throw new Error("Contador de OS inválido. A numeração não foi alterada.");
  }
  if (ultimaOS === Number.MAX_SAFE_INTEGER) {
    throw new Error("Limite numérico da OS atingido. A numeração não será reiniciada.");
  }
  return ultimaOS + 1;
}

export function formatarOS(os: number | null | undefined): string {
  if (os == null) return "Sem OS";
  if (!Number.isSafeInteger(os) || os < 1) return "OS inválida";
  return String(os).padStart(4, "0");
}
