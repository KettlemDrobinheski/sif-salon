/** Nomes das coleções principais do Firestore. */
export const firestoreCollections = {
  admins: "admins",
  funcionarios: "funcionarios",
  servicos: "servicos",
  atendimentos: "atendimentos",
  comissoes: "comissoes",
} as const;

export type AdminDocument = {
  nome: string;
  email: string;
  perfil: "admin";
  ativo: boolean;
};

export type FuncionarioDocument = {
  nome: string;
  email: string;
  /** Ausente nos cadastros antigos; obrigatório ao criar um funcionário. */
  percentualComissao?: number;
  cargo: "Barbeiro";
  perfil: "funcionario";
  ativo: boolean;
};

export type ServicoDocument = {
  nome: string;
  valor: number;
  percentualComissao: number;
  ativo: boolean;
};

/** Registro imutável do serviço e da comissão calculada no atendimento. */
export type AtendimentoDocument = {
  /** Número permanente. Ausente apenas nos registros anteriores à implantação. */
  os?: number;
  funcionarioId: string;
  clienteId?: string;
  clienteNome?: string;
  servicoId: string;
  /** Itens e preços históricos da mesma OS; ausente nos registros antigos. */
  servicos?: { servicoId: string; nome: string; valor: number }[];
  nomeServico: string;
  valor: number;
  percentualComissao: number | null;
  comissao: number | null;
  data: string;
  dataEpochMs?: number;
};

/** Resumo opcional de comissão por funcionário e período. */
export type ComissaoDocument = {
  funcionarioId: string;
  inicioPeriodo: string;
  fimPeriodo: string;
  totalAtendimentos: number;
  valorTotalServicos: number;
  valorTotalComissao: number;
};

type CriarAtendimentoInput = Omit<AtendimentoDocument, "comissao">;

export function criarAdmin(nome: string, email: string): AdminDocument {
  return { nome, email, perfil: "admin", ativo: true };
}

export function criarFuncionario(
  nome: string,
  email: string,
  percentualComissao: number,
): FuncionarioDocument {
  if (!Number.isFinite(percentualComissao) || percentualComissao < 0 || percentualComissao > 100) {
    throw new Error("Informe a comissão do funcionário entre 0% e 100%.");
  }
  return { nome, email, percentualComissao, cargo: "Barbeiro", perfil: "funcionario", ativo: true };
}

export function criarServico(
  nome: string,
  valor: number,
): Omit<ServicoDocument, "percentualComissao"> {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("O valor do serviço deve ser um número positivo.");
  }

  return { nome, valor, ativo: true };
}

export function calcularComissao(valor: number, percentualComissao: number | null) {
  if (percentualComissao === null) {
    throw new Error("Há atendimento sem comissão cadastrada neste período. Comissão indisponível.");
  }
  validarValoresDoServico(valor, percentualComissao);

  return Math.round(valor * (percentualComissao / 100) * 100) / 100;
}

export function criarAtendimento({
  valor,
  percentualComissao,
  ...atendimento
}: CriarAtendimentoInput): AtendimentoDocument {
  return {
    ...atendimento,
    valor,
    percentualComissao,
    comissao: percentualComissao === null ? null : calcularComissao(valor, percentualComissao),
  };
}

function validarValoresDoServico(valor: number, percentualComissao: number) {
  if (!Number.isFinite(valor) || valor < 0) {
    throw new Error("O valor do serviço deve ser um número positivo.");
  }

  if (
    !Number.isFinite(percentualComissao) ||
    percentualComissao < 0 ||
    percentualComissao > 100
  ) {
    throw new Error("A comissão deve estar entre 0% e 100%.");
  }
}
