"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { contadorOSPath, proximaOS } from "@/lib/ordem-servico";
import {
  calcularComissao,
  criarAtendimento,
  firestoreCollections,
  type AdminDocument,
  type AtendimentoDocument,
  type ComissaoDocument,
  type FuncionarioDocument,
  type ServicoDocument,
} from "@/lib/firestore-collections";

type Documento<T> = T & { id: string };
type Colecao = (typeof firestoreCollections)[keyof typeof firestoreCollections];

export async function listarDocumentos<T>(colecao: Colecao) {
  const snapshot = await getDocs(collection(db, colecao));

  return snapshot.docs.map((item) => ({
    id: item.id,
    ...(item.data() as T),
  }));
}

export async function obterDocumento<T>(colecao: Colecao, id: string) {
  const snapshot = await getDoc(doc(db, colecao, id));

  return snapshot.exists()
    ? ({ id: snapshot.id, ...(snapshot.data() as T) } as Documento<T>)
    : null;
}

export async function criarDocumento<T extends object>(colecao: Colecao, dados: T) {
  if (colecao === firestoreCollections.atendimentos) {
    throw new Error("Use registrarAtendimento para gerar uma OS única.");
  }
  const reference = await addDoc(collection(db, colecao), {
    ...dados,
    criadoEm: serverTimestamp(),
  });

  return reference.id;
}

export async function atualizarDocumento<T extends object>(
  colecao: Colecao,
  id: string,
  dados: Partial<T>,
) {
  if (colecao === firestoreCollections.atendimentos && "os" in dados) {
    throw new Error("A OS de um atendimento não pode ser alterada.");
  }
  await updateDoc(doc(db, colecao, id), {
    ...dados,
    atualizadoEm: serverTimestamp(),
  });
}

export async function removerDocumento(colecao: Colecao, id: string) {
  await deleteDoc(doc(db, colecao, id));
}

export const listarAdmins = () => listarDocumentos<AdminDocument>(firestoreCollections.admins);
export const listarFuncionarios = () =>
  listarDocumentos<FuncionarioDocument>(firestoreCollections.funcionarios);
export const listarServicos = () =>
  listarDocumentos<ServicoDocument>(firestoreCollections.servicos);
export const listarAtendimentos = () =>
  listarDocumentos<AtendimentoDocument>(firestoreCollections.atendimentos);

/** Um documento, uma OS e snapshots de todos os serviços selecionados. */
export async function registrarAtendimento({ funcionarioId, servicoIds, clienteNome }: {
  funcionarioId: string;
  servicoIds: string[];
  clienteNome: string;
}) {
  if (!funcionarioId?.trim()) throw new Error("Selecione um funcionário.");
  if (!clienteNome?.trim()) throw new Error("Informe o nome do cliente.");
  if (!servicoIds.length || servicoIds.some((id) => !id.trim())) throw new Error("Selecione pelo menos um serviço e preencha todas as seleções.");
  if (new Set(servicoIds).size !== servicoIds.length) throw new Error("Não repita serviços no mesmo atendimento.");
  const atendimentoRef = doc(collection(db, firestoreCollections.atendimentos));
  const contadorRef = doc(db, ...contadorOSPath);

  const os = await runTransaction(db, async (transaction) => {
    const [contador, funcionarioSnapshot, ...serviceSnapshots] = await Promise.all([
      transaction.get(contadorRef),
      transaction.get(doc(db, firestoreCollections.funcionarios, funcionarioId)),
      ...servicoIds.map((id) => transaction.get(doc(db, firestoreCollections.servicos, id))),
    ]);
    const funcionario = funcionarioSnapshot.data() as FuncionarioDocument | undefined;
    if (!funcionario?.ativo) throw new Error("O funcionário informado não está ativo.");
    const itens = serviceSnapshots.map((snapshot, index) => {
      const servico = snapshot.data() as ServicoDocument | undefined;
      if (!servico?.ativo) throw new Error("Um dos serviços selecionados não está disponível.");
      if (!Number.isFinite(servico.valor) || servico.valor < 0) throw new Error("Um serviço possui valor inválido.");
      return { servicoId: servicoIds[index], nome: servico.nome, valor: servico.valor };
    });
    const valor = itens.reduce((sum, item) => sum + Math.round(item.valor * 100), 0) / 100;
    const raw = funcionario.percentualComissao;
    const percentualComissao = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
    const dataEpochMs = Date.now();
    const atendimento = criarAtendimento({
      funcionarioId,
      clienteNome: clienteNome.trim(),
      servicoId: servicoIds[0],
      servicos: itens,
      nomeServico: itens.map((item) => item.nome).join(", "),
      valor,
      percentualComissao,
      data: new Date(dataEpochMs).toISOString(),
      dataEpochMs,
    });
    const numero = proximaOS(contador.exists() ? contador.data().ultimaOS : 0);
    transaction.set(contadorRef, { ultimaOS: numero });
    transaction.set(atendimentoRef, { ...atendimento, os: numero, criadoEm: serverTimestamp() });
    return numero;
  });
  return { id: atendimentoRef.id, os };
}

/** Atualiza somente o conteúdo: não grava OS, data original ou contador. */
export async function editarAtendimento(id: string, input: {
  funcionarioId: string; clienteNome: string; servicoIds: string[];
}) {
  const { funcionarioId, clienteNome, servicoIds } = input;
  if (!id || !funcionarioId.trim() || !clienteNome.trim()) throw new Error("Informe funcionário e cliente.");
  if (!servicoIds.length || servicoIds.some((value) => !value.trim())) throw new Error("Selecione pelo menos um serviço.");
  if (new Set(servicoIds).size !== servicoIds.length) throw new Error("Não repita serviços no atendimento.");
  const reference = doc(db, firestoreCollections.atendimentos, id);
  return runTransaction(db, async (transaction) => {
    const [originalSnapshot, employeeSnapshot, ...snapshots] = await Promise.all([
      transaction.get(reference),
      transaction.get(doc(db, firestoreCollections.funcionarios, funcionarioId)),
      ...servicoIds.map((value) => transaction.get(doc(db, firestoreCollections.servicos, value))),
    ]);
    if (!originalSnapshot.exists()) throw new Error("Este atendimento já foi excluído. Atualize a listagem.");
    const original = originalSnapshot.data() as AtendimentoDocument;
    const employee = employeeSnapshot.data() as FuncionarioDocument | undefined;
    if (!employee?.ativo) throw new Error("Selecione um funcionário ativo.");
    const originals = original.servicos?.length ? original.servicos : [{ servicoId: original.servicoId, nome: original.nomeServico, valor: original.valor }];
    const servicos = servicoIds.map((servicoId, index) => {
      const historical = originals.find((item) => item.servicoId === servicoId);
      const current = snapshots[index].data() as ServicoDocument | undefined;
      if (!historical && !current?.ativo) throw new Error("Um serviço selecionado não está disponível.");
      const item = historical ?? { servicoId, nome: current!.nome, valor: current!.valor };
      if (!Number.isFinite(item.valor) || item.valor < 0) throw new Error("Valor do serviço inválido.");
      return item;
    });
    const valor = servicos.reduce((sum, item) => sum + Math.round(item.valor * 100), 0) / 100;
    const raw = employee.percentualComissao;
    const percentualComissao = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
    transaction.update(reference, {
      funcionarioId, clienteNome: clienteNome.trim(), servicos,
      servicoId: servicoIds[0], nomeServico: servicos.map((item) => item.nome).join(", "),
      valor, percentualComissao,
      comissao: percentualComissao === null ? null : calcularComissao(valor, percentualComissao),
      atualizadoEm: serverTimestamp(),
    });
    return { id, os: original.os };
  });
}

export async function calcularComissaoPorPeriodo(
  funcionarioId: string,
  inicioPeriodo: string,
  fimPeriodo: string,
): Promise<ComissaoDocument> {
  return resumirComissaoPorPeriodo(await listarAtendimentos(), funcionarioId, inicioPeriodo, fimPeriodo);
}

export function resumirComissaoPorPeriodo(
  atendimentos: AtendimentoDocument[], funcionarioId: string, inicioPeriodo: string, fimPeriodo: string,
): ComissaoDocument {
  const inicio = Date.parse(inicioPeriodo);
  const fim = Date.parse(fimPeriodo);

  if (Number.isNaN(inicio) || Number.isNaN(fim) || inicio > fim) {
    throw new Error("Informe um período de datas válido.");
  }

  const atendimentosDoPeriodo = atendimentos.filter((atendimento) => {
    const data = Date.parse(atendimento.data);
    return atendimento.funcionarioId === funcionarioId && data >= inicio && data <= fim;
  });

  const valorTotalServicos = atendimentosDoPeriodo.reduce(
    (total, atendimento) => total + atendimento.valor,
    0,
  );
  const valorTotalComissao = atendimentosDoPeriodo.reduce(
    (total, atendimento) =>
      total + calcularComissao(atendimento.valor, atendimento.percentualComissao),
    0,
  );

  return {
    funcionarioId,
    inicioPeriodo,
    fimPeriodo,
    totalAtendimentos: atendimentosDoPeriodo.length,
    valorTotalServicos: Math.round(valorTotalServicos * 100) / 100,
    valorTotalComissao: Math.round(valorTotalComissao * 100) / 100,
  };
}

/** Cada snapshot substitui o resumo inteiro; nunca acumula eventos individuais. */
export function observarComissaoPorPeriodo(
  funcionarioId: string, inicioPeriodo: string, fimPeriodo: string,
  onUpdate: (resumo: ComissaoDocument) => void,
  onError: (cause: Error) => void,
) {
  let active = true;
  const unsubscribe = onSnapshot(
    query(collection(db, firestoreCollections.atendimentos), where("funcionarioId", "==", funcionarioId)),
    (snapshot) => {
      if (!active) return;
      try {
        onUpdate(resumirComissaoPorPeriodo(snapshot.docs.map((item) => item.data() as AtendimentoDocument), funcionarioId, inicioPeriodo, fimPeriodo));
      } catch (cause) { onError(cause instanceof Error ? cause : new Error("Não foi possível calcular a comissão.")); }
    },
    (cause) => { if (active) onError(cause); },
  );
  return () => { active = false; unsubscribe(); };
}
