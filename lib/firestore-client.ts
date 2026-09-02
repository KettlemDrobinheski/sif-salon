"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
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

/** Cria um atendimento com os valores atuais do serviço registrados como histórico. */
export async function registrarAtendimento({
  funcionarioId,
  servicoId,
  clienteId,
  clienteNome,
  data = new Date().toISOString(),
}: Pick<AtendimentoDocument, "funcionarioId" | "servicoId"> &
  Pick<AtendimentoDocument, "clienteId" | "clienteNome"> & { data?: string }) {
  const [funcionario, servico] = await Promise.all([
    obterDocumento<FuncionarioDocument>(
      firestoreCollections.funcionarios,
      funcionarioId,
    ),
    obterDocumento<ServicoDocument>(firestoreCollections.servicos, servicoId),
  ]);

  if (!funcionario?.ativo) throw new Error("O funcionário informado não está ativo.");
  if (!servico?.ativo) throw new Error("O serviço informado não está ativo.");

  const atendimento = criarAtendimento({
    funcionarioId,
    servicoId,
    ...(clienteId ? { clienteId } : {}),
    ...(clienteNome ? { clienteNome } : {}),
    data,
    nomeServico: servico.nome,
    valor: servico.valor,
    percentualComissao: servico.percentualComissao,
  });

  return criarDocumento(firestoreCollections.atendimentos, atendimento);
}

export async function calcularComissaoPorPeriodo(
  funcionarioId: string,
  inicioPeriodo: string,
  fimPeriodo: string,
): Promise<ComissaoDocument> {
  const inicio = Date.parse(inicioPeriodo);
  const fim = Date.parse(fimPeriodo);

  if (Number.isNaN(inicio) || Number.isNaN(fim) || inicio > fim) {
    throw new Error("Informe um período de datas válido.");
  }

  const atendimentos = await listarAtendimentos();
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
