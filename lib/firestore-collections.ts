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
  funcionarioId: string;
  clienteId?: string;
  clienteNome?: string;
  servicoId: string;
  nomeServico: string;
  valor: number;
  percentualComissao: number;
  comissao: number;
  data: string;
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
): FuncionarioDocument {
  return { nome, email, cargo: "Barbeiro", perfil: "funcionario", ativo: true };
}

export function criarServico(
  nome: string,
  valor: number,
  percentualComissao: number,
): ServicoDocument {
  validarValoresDoServico(valor, percentualComissao);

  return { nome, valor, percentualComissao, ativo: true };
}

export function calcularComissao(valor: number, percentualComissao: number) {
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
    comissao: calcularComissao(valor, percentualComissao),
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
