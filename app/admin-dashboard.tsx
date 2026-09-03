"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Modal } from "@/components/Modal";
import {
  calcularComissao,
  criarAdmin,
  criarFuncionario,
  criarServico,
  firestoreCollections,
  type AdminDocument,
  type AtendimentoDocument,
  type ComissaoDocument,
  type FuncionarioDocument,
  type ServicoDocument,
} from "@/lib/firestore-collections";
import {
  atualizarDocumento,
  calcularComissaoPorPeriodo,
  criarDocumento,
  listarAdmins,
  listarAtendimentos,
  listarFuncionarios,
  listarServicos,
  registrarAtendimento,
  removerDocumento,
} from "@/lib/firestore-client";

type DocumentWithId<T> = T & { id: string };
type Tab = "admins" | "funcionarios" | "servicos" | "atendimentos" | "comissoes";

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "admins", label: "Administração", icon: "◈" },
  { id: "funcionarios", label: "Funcionários", icon: "♙" },
  { id: "servicos", label: "Serviços", icon: "✂" },
  { id: "atendimentos", label: "Atendimentos", icon: "▣" },
  { id: "comissoes", label: "Comissões", icon: "◌" },
];

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export default function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("admins");
  const [admins, setAdmins] = useState<DocumentWithId<AdminDocument>[]>([]);
  const [funcionarios, setFuncionarios] = useState<DocumentWithId<FuncionarioDocument>[]>([]);
  const [servicos, setServicos] = useState<DocumentWithId<ServicoDocument>[]>([]);
  const [atendimentos, setAtendimentos] = useState<DocumentWithId<AtendimentoDocument>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [resumo, setResumo] = useState<ComissaoDocument | null>(null);
  const [editingFuncionario, setEditingFuncionario] = useState<DocumentWithId<FuncionarioDocument> | null>(null);
  const [deletingFuncionario, setDeletingFuncionario] = useState<DocumentWithId<FuncionarioDocument> | null>(null);
  const [editingServico, setEditingServico] = useState<DocumentWithId<ServicoDocument> | null>(null);
  const [deletingServico, setDeletingServico] = useState<DocumentWithId<ServicoDocument> | null>(null);
  const [editingAtendimento, setEditingAtendimento] = useState<DocumentWithId<AtendimentoDocument> | null>(null);
  const [deletingAtendimento, setDeletingAtendimento] = useState<DocumentWithId<AtendimentoDocument> | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [dadosAdmins, dadosFuncionarios, dadosServicos, dadosAtendimentos] =
        await Promise.all([
          listarAdmins(),
          listarFuncionarios(),
          listarServicos(),
          listarAtendimentos(),
        ]);

      setAdmins(dadosAdmins);
      setFuncionarios(dadosFuncionarios);
      setServicos(dadosServicos);
      setAtendimentos(dadosAtendimentos);
    } catch (cause) {
      setError(getErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void carregarDados(), 0);

    return () => window.clearTimeout(timer);
  }, [carregarDados]);

  const nomesFuncionarios = useMemo(
    () => new Map(funcionarios.map((funcionario) => [funcionario.id, funcionario.nome])),
    [funcionarios],
  );

  async function salvar(action: () => Promise<void>, successMessage: string) {
    setError("");
    setMessage("");

    try {
      await action();
      setMessage(successMessage);
      await carregarDados();
    } catch (cause) {
      setError(getErrorMessage(cause));
    }
  }

  function handleCreateAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    void salvar(async () => {
      await criarDocumento(
        firestoreCollections.admins,
        criarAdmin(String(data.get("nome")), String(data.get("email"))),
      );
      form.reset();
    }, "Administrador cadastrado.");
  }

  function handleCreateFuncionario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    void salvar(async () => {
      await criarDocumento(
        firestoreCollections.funcionarios,
        criarFuncionario(String(data.get("nome")), String(data.get("email"))),
      );
      form.reset();
    }, "Funcionário cadastrado.");
  }

  function handleCreateServico(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    void salvar(async () => {
      await criarDocumento(
        firestoreCollections.servicos,
        criarServico(
          String(data.get("nome")),
          Number(data.get("valor")),
          Number(data.get("percentualComissao")),
        ),
      );
      form.reset();
    }, "Serviço cadastrado.");
  }

  function handleUpdateFuncionario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingFuncionario) return;
    const data = new FormData(event.currentTarget);

    void salvar(async () => {
      await atualizarDocumento<FuncionarioDocument>(
        firestoreCollections.funcionarios,
        editingFuncionario.id,
        { nome: String(data.get("nome")), email: String(data.get("email")) },
      );
      setEditingFuncionario(null);
    }, "Funcionário atualizado.");
  }

  function handleDeleteFuncionario() {
    if (!deletingFuncionario) return;

    void salvar(async () => {
      await removerDocumento(firestoreCollections.funcionarios, deletingFuncionario.id);
      setDeletingFuncionario(null);
    }, "Funcionário excluído.");
  }

  function handleUpdateServico(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingServico) return;
    const data = new FormData(event.currentTarget);

    void salvar(async () => {
      await atualizarDocumento<ServicoDocument>(firestoreCollections.servicos, editingServico.id, {
        nome: String(data.get("nome")),
        valor: Number(data.get("valor")),
        percentualComissao: Number(data.get("percentualComissao")),
      });
      setEditingServico(null);
    }, "Serviço atualizado.");
  }

  function handleDeleteServico() {
    if (!deletingServico) return;

    void salvar(async () => {
      await removerDocumento(firestoreCollections.servicos, deletingServico.id);
      setDeletingServico(null);
    }, "Serviço excluído.");
  }

  function handleCreateAtendimento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    void salvar(async () => {
      await registrarAtendimento({
        funcionarioId: String(data.get("funcionarioId")),
        servicoId: String(data.get("servicoId")),
        clienteNome: String(data.get("clienteNome") || ""),
      });
      form.reset();
    }, "Atendimento registrado e comissão calculada.");
  }

  function handleUpdateAtendimento(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAtendimento) return;
    const data = new FormData(event.currentTarget);
    const servicoId = String(data.get("servicoId"));
    const servico = servicos.find((item) => item.id === servicoId);
    const clienteNome = String(data.get("clienteNome") || "");

    void salvar(async () => {
      if (!servico) throw new Error("Selecione um serviço válido.");

      await atualizarDocumento<AtendimentoDocument>(firestoreCollections.atendimentos, editingAtendimento.id, {
        funcionarioId: String(data.get("funcionarioId")),
        servicoId,
        nomeServico: servico.nome,
        valor: servico.valor,
        percentualComissao: servico.percentualComissao,
        comissao: calcularComissao(servico.valor, servico.percentualComissao),
        clienteNome,
      });
      setEditingAtendimento(null);
    }, "Atendimento atualizado.");
  }

  function handleDeleteAtendimento() {
    if (!deletingAtendimento) return;

    void salvar(async () => {
      await removerDocumento(firestoreCollections.atendimentos, deletingAtendimento.id);
      setDeletingAtendimento(null);
    }, "Atendimento excluído.");
  }

  function handleCalcularComissao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError("");
    setMessage("");

    void calcularComissaoPorPeriodo(
      String(data.get("funcionarioId")),
      `${String(data.get("inicioPeriodo"))}T00:00:00.000Z`,
      `${String(data.get("fimPeriodo"))}T23:59:59.999Z`,
    )
      .then(setResumo)
      .catch((cause) => setError(getErrorMessage(cause)));
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <aside className="border-b border-stone-200 bg-stone-950 px-5 py-6 text-stone-100 lg:w-72 lg:border-r lg:border-b-0">
          <div className="mb-8 flex items-center gap-3 px-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400 text-lg font-black text-stone-950">S</div>
            <div>
              <p className="text-lg font-bold">SIF Salon</p>
              <p className="text-xs text-stone-400">Painel administrativo</p>
            </div>
          </div>
          <nav className="flex gap-2 overflow-x-auto lg:flex-col">
            {tabs.map((item) => (
              <button
                className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition ${
                  tab === item.id
                    ? "bg-amber-400 text-stone-950"
                    : "text-stone-300 hover:bg-stone-800 hover:text-white"
                }`}
                key={item.id}
                onClick={() => {
                  setTab(item.id);
                  setMessage("");
                  setError("");
                }}
                type="button"
              >
                <span aria-hidden="true" className="text-base">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex-1 px-5 py-8 sm:px-8 lg:px-12">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.18em] text-amber-700">GESTÃO DO SALÃO - Matheus Baber</p>
              <h1 className="text-3xl font-bold tracking-tight">{tabs.find((item) => item.id === tab)?.label}</h1>
            </div>
            <button className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50" onClick={() => void carregarDados()} type="button">
              Atualizar dados
            </button>
          </header>

          {error && <Alert tone="error">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}
          {loading ? <p className="text-sm text-stone-500">Carregando dados do Firestore…</p> : null}

          {!loading && tab === "admins" && (
            <EntityScreen
              description="Cadastre os responsáveis pela gestão do salão."
              empty="Nenhum administrador cadastrado."
              form={<AdminForm onSubmit={handleCreateAdmin} />}
              rows={admins.map((admin) => [admin.nome, admin.email, admin.ativo ? "Ativo" : "Inativo"])}
              headers={["Nome", "E-mail", "Status"]}
            />
          )}

          {!loading && tab === "funcionarios" && (
            <EntityScreen
              description="Cadastre e acompanhe os barbeiros ativos do salão."
              empty="Nenhum funcionário cadastrado."
              form={<FuncionarioForm onSubmit={handleCreateFuncionario} />}
              rows={funcionarios.map((funcionario) => [
                funcionario.nome,
                funcionario.email,
                funcionario.cargo,
                funcionario.ativo ? "Ativo" : "Inativo",
                <RowActions
                  key="actions"
                  onEdit={() => setEditingFuncionario(funcionario)}
                  onDelete={() => setDeletingFuncionario(funcionario)}
                />,
              ])}
              headers={["Nome", "E-mail", "Cargo", "Status", "Ações"]}
            />
          )}

          {!loading && tab === "servicos" && (
            <EntityScreen
              description="Defina os serviços, valores e percentuais de comissão do salão."
              empty="Nenhum serviço cadastrado."
              form={<ServicoForm onSubmit={handleCreateServico} />}
              rows={servicos.map((servico) => [
                servico.nome,
                currency.format(servico.valor),
                `${servico.percentualComissao}%`,
                currency.format(servico.valor * servico.percentualComissao / 100),
                <RowActions
                  key="actions"
                  onEdit={() => setEditingServico(servico)}
                  onDelete={() => setDeletingServico(servico)}
                />,
              ])}
              headers={["Serviço", "Valor", "Comissão", "Valor da comissão", "Ações"]}
            />
          )}

          {!loading && tab === "atendimentos" && (
            <EntityScreen
              description="Registre cada atendimento. A comissão é calculada automaticamente a partir do serviço escolhido."
              empty="Nenhum atendimento registrado."
              form={<AtendimentoForm funcionarios={funcionarios} servicos={servicos} onSubmit={handleCreateAtendimento} />}
              rows={atendimentos.map((atendimento) => [
                atendimento.nomeServico,
                nomesFuncionarios.get(atendimento.funcionarioId) ?? "Funcionário removido",
                atendimento.clienteNome || "Não informado",
                currency.format(atendimento.valor),
                currency.format(atendimento.comissao),
                <RowActions
                  key="actions"
                  onEdit={() => setEditingAtendimento(atendimento)}
                  onDelete={() => setDeletingAtendimento(atendimento)}
                />,
              ])}
              headers={["Serviço", "Funcionário", "Cliente", "Valor", "Comissão", "Ações"]}
            />
          )}

          {!loading && tab === "comissoes" && (
            <CommissionScreen funcionarios={funcionarios} resumo={resumo} onSubmit={handleCalcularComissao} />
          )}
        </section>
      </div>

      {editingFuncionario && (
        <Modal title="Editar funcionário" onClose={() => setEditingFuncionario(null)}>
          <FuncionarioForm
            defaultValues={editingFuncionario}
            onSubmit={handleUpdateFuncionario}
            stacked
            submitLabel="Salvar alterações"
          />
        </Modal>
      )}

      {deletingFuncionario && (
        <Modal title="Excluir funcionário" onClose={() => setDeletingFuncionario(null)}>
          <ConfirmDelete
            message={`Tem certeza de que deseja excluir o funcionário "${deletingFuncionario.nome}"? Essa ação não pode ser desfeita.`}
            onCancel={() => setDeletingFuncionario(null)}
            onConfirm={handleDeleteFuncionario}
          />
        </Modal>
      )}

      {editingServico && (
        <Modal title="Editar serviço" onClose={() => setEditingServico(null)}>
          <ServicoForm
            defaultValues={editingServico}
            onSubmit={handleUpdateServico}
            stacked
            submitLabel="Salvar alterações"
          />
        </Modal>
      )}

      {deletingServico && (
        <Modal title="Excluir serviço" onClose={() => setDeletingServico(null)}>
          <ConfirmDelete
            message={`Tem certeza de que deseja excluir o serviço "${deletingServico.nome}"? Essa ação não pode ser desfeita.`}
            onCancel={() => setDeletingServico(null)}
            onConfirm={handleDeleteServico}
          />
        </Modal>
      )}

      {editingAtendimento && (
        <Modal title="Editar atendimento" onClose={() => setEditingAtendimento(null)}>
          <AtendimentoForm
            defaultValues={editingAtendimento}
            funcionarios={funcionarios}
            onSubmit={handleUpdateAtendimento}
            servicos={servicos}
            stacked
            submitLabel="Salvar alterações"
          />
        </Modal>
      )}

      {deletingAtendimento && (
        <Modal title="Excluir atendimento" onClose={() => setDeletingAtendimento(null)}>
          <ConfirmDelete
            message={`Tem certeza de que deseja excluir o atendimento "${deletingAtendimento.nomeServico}" de "${deletingAtendimento.clienteNome || "cliente não informado"}"? Essa ação não pode ser desfeita.`}
            onCancel={() => setDeletingAtendimento(null)}
            onConfirm={handleDeleteAtendimento}
          />
        </Modal>
      )}
    </main>
  );
}

function EntityScreen({ description, form, headers, rows, empty }: { description: string; form: React.ReactNode; headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return <div className="space-y-7"><p className="max-w-2xl text-sm leading-6 text-stone-600">{description}</p><section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">{form}</section><Table headers={headers} rows={rows} empty={empty} /></div>;
}

function Table({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr>{headers.map((header) => <th className="px-5 py-4 font-semibold" key={header}>{header}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className="px-5 py-4 text-stone-700" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div></div>;
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <button
        aria-label="Editar"
        className="rounded-lg p-2 text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
        onClick={onEdit}
        type="button"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        aria-label="Excluir"
        className="rounded-lg p-2 text-stone-500 transition hover:bg-red-50 hover:text-red-600"
        onClick={onDelete}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function ConfirmDelete({ message, onCancel, onConfirm }: { message: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="space-y-5">
      <p className="text-sm leading-6 text-stone-600">{message}</p>
      <div className="flex justify-end gap-3">
        <button
          className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50"
          onClick={onCancel}
          type="button"
        >
          Cancelar
        </button>
        <button
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700"
          onClick={onConfirm}
          type="button"
        >
          Excluir
        </button>
      </div>
    </div>
  );
}

function AdminForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <form className="grid gap-4 sm:grid-cols-3" onSubmit={onSubmit}><Input name="nome" label="Nome do administrador" /><Input name="email" label="E-mail" type="email" /><Submit label="Cadastrar administrador" /></form>; }
function FuncionarioForm({ defaultValues, onSubmit, submitLabel = "Cadastrar funcionário", stacked = false }: { defaultValues?: FuncionarioDocument; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel?: string; stacked?: boolean }) { return <form className={`grid gap-4 ${stacked ? "grid-cols-1" : "sm:grid-cols-3"}`} onSubmit={onSubmit}><Input defaultValue={defaultValues?.nome} name="nome" label="Nome do funcionário" /><Input defaultValue={defaultValues?.email} name="email" label="E-mail" type="email" /><Submit label={submitLabel} /></form>; }
function ServicoForm({ defaultValues, onSubmit, submitLabel = "Cadastrar serviço", stacked = false }: { defaultValues?: ServicoDocument; onSubmit: (event: FormEvent<HTMLFormElement>) => void; submitLabel?: string; stacked?: boolean }) { return <form className={`grid gap-4 ${stacked ? "grid-cols-1" : "sm:grid-cols-4"}`} onSubmit={onSubmit}><Input defaultValue={defaultValues?.nome} name="nome" label="Nome do serviço" /><Input defaultValue={defaultValues?.valor} name="valor" label="Valor (R$)" min="0" step="0.01" type="number" /><Input defaultValue={defaultValues?.percentualComissao} name="percentualComissao" label="Comissão (%)" min="0" max="100" type="number" /><Submit label={submitLabel} /></form>; }

function AtendimentoForm({ defaultValues, funcionarios, servicos, onSubmit, stacked = false, submitLabel = "Registrar atendimento" }: { defaultValues?: Pick<AtendimentoDocument, "funcionarioId" | "servicoId" | "clienteNome">; funcionarios: DocumentWithId<FuncionarioDocument>[]; servicos: DocumentWithId<ServicoDocument>[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; stacked?: boolean; submitLabel?: string }) {
  return <form className={`grid gap-4 ${stacked ? "grid-cols-1" : "sm:grid-cols-4"}`} onSubmit={onSubmit}><Select defaultValue={defaultValues?.funcionarioId} name="funcionarioId" label="Funcionário" placeholder="Selecione" options={funcionarios.filter((item) => item.ativo).map((item) => ({ value: item.id, label: item.nome }))} /><Select defaultValue={defaultValues?.servicoId} name="servicoId" label="Serviço" placeholder="Selecione" options={servicos.filter((item) => item.ativo).map((item) => ({ value: item.id, label: `${item.nome} · ${currency.format(item.valor)}` }))} /><Input defaultValue={defaultValues?.clienteNome} name="clienteNome" label="Nome do cliente" required={false} /><Submit label={submitLabel} disabled={!funcionarios.length || !servicos.length} /></form>;
}

function CommissionScreen({ funcionarios, resumo, onSubmit }: { funcionarios: DocumentWithId<FuncionarioDocument>[]; resumo: ComissaoDocument | null; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="space-y-7"><p className="max-w-2xl text-sm leading-6 text-stone-600">Consulte o total de serviços e comissão de cada barbeiro por período.</p><form className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:grid-cols-4" onSubmit={onSubmit}><Select name="funcionarioId" label="Funcionário" placeholder="Selecione" options={funcionarios.map((item) => ({ value: item.id, label: item.nome }))} /><Input name="inicioPeriodo" label="Início" type="date" /><Input name="fimPeriodo" label="Fim" type="date" /><Submit label="Calcular comissão" /></form>{resumo && <div className="grid gap-4 sm:grid-cols-3"><Metric label="Atendimentos" value={String(resumo.totalAtendimentos)} /><Metric label="Valor dos serviços" value={currency.format(resumo.valorTotalServicos)} /><Metric label="Comissão total" value={currency.format(resumo.valorTotalComissao)} /></div>}</div>;
}

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="grid gap-1.5 text-sm font-medium text-stone-700"><span>{label}</span><input className="h-11 rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100" required={props.required ?? true} {...props} /></label>; }
function Select({ label, placeholder, options, name, defaultValue = "" }: { label: string; placeholder: string; options: Array<{ value: string; label: string }>; name: string; defaultValue?: string }) { return <label className="grid gap-1.5 text-sm font-medium text-stone-700"><span>{label}</span><select className="h-11 rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100" name={name} required defaultValue={defaultValue}><option disabled value="">{placeholder}</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>; }
function Submit({ label, disabled = false }: { label: string; disabled?: boolean }) { return <button className="mt-auto h-11 rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={disabled} type="submit">{label}</button>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl bg-stone-950 p-5 text-white"><p className="text-sm text-stone-400">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>; }
function Alert({ children, tone }: { children: string; tone: "error" | "success" }) { return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>; }
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir a operação."; }
