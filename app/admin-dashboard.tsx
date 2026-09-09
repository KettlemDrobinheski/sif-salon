"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import ComissoesScreen, { type FiltrosComissao } from "./comissoes-screen";
import AtendimentosScreen from "./atendimentos-screen";
import SalonHome, { HomeClock } from "./salon-home";
import { HomeIcon } from "./home-icons";
import FuncionarioAcoes from "./funcionario-acoes";
import ServicoAcoes from "./servico-acoes";
import { formatarOS } from "@/lib/ordem-servico";

import {
  criarFuncionario,
  criarServico,
  firestoreCollections,
  type AtendimentoDocument,
  type FuncionarioDocument,
  type ServicoDocument,
} from "@/lib/firestore-collections";
import {
  criarDocumento,
  listarAtendimentos,
  listarFuncionarios,
  listarServicos,
} from "@/lib/firestore-client";

type DocumentWithId<T> = T & { id: string };
type Tab = "home" | "funcionarios" | "servicos" | "atendimentos" | "comissoes";

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: "home", label: "Home", icon: "⌂" },
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
  const [tab, setTab] = useState<Tab>("home");
  const [funcionarioFiltro, setFuncionarioFiltro] = useState<string | null>(null);
  const [funcionarios, setFuncionarios] = useState<DocumentWithId<FuncionarioDocument>[]>([]);
  const [servicos, setServicos] = useState<DocumentWithId<ServicoDocument>[]>([]);
  const [atendimentos, setAtendimentos] = useState<DocumentWithId<AtendimentoDocument>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [filtrosComissao, setFiltrosComissao] = useState<FiltrosComissao>({ funcionarioId: "", inicio: "", fim: "" });

  const carregarDados = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [dadosFuncionarios, dadosServicos, dadosAtendimentos] =
        await Promise.all([
          listarFuncionarios(),
          listarServicos(),
          listarAtendimentos(),
        ]);

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

  async function handleActionSaved(successMessage: string) {
    setMessage(successMessage);
    await carregarDados();
  }

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

  function handleCreateFuncionario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    void salvar(async () => {
      await criarDocumento(
        firestoreCollections.funcionarios,
        criarFuncionario(
          String(data.get("nome")),
          String(data.get("email")),
          String(data.get("percentualComissao") ?? "").trim() === ""
            ? NaN
            : Number(data.get("percentualComissao")),
        ),
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
        ),
      );
      form.reset();
    }, "Serviço cadastrado.");
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <aside className="border-b border-stone-200 bg-stone-950 px-5 py-6 text-stone-100 lg:w-72 lg:border-r lg:border-b-0">
          <div className="mb-8 flex items-center gap-3 px-2">
            <Image src="/logo-barbearia.png" alt="Logo SIF Salon" width={40} height={40} className="h-10 w-10 shrink-0 rounded-xl object-contain" />
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
                  setFuncionarioFiltro(null);
                  setMessage("");
                  setError("");
                }}
                type="button"
              >
                {tab === "home" ? <HomeIcon name={item.id} /> : <span aria-hidden="true" className="text-base">{item.icon}</span>}
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <section className={`${tab === "home" || tab === "atendimentos" ? "min-w-0 " : ""}flex-1 px-5 py-8 sm:px-8 lg:px-12`}>
          <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold tracking-[0.18em] text-amber-700">GESTÃO DO SALÃO - Matheus Baber</p>
              <h1 className="text-3xl font-bold tracking-tight">{tabs.find((item) => item.id === tab)?.label}</h1>
              {tab === "home" && <p className="mt-2 text-sm text-stone-600">Visão geral do salão em tempo real.</p>}
            </div>
            {tab === "home" && <HomeClock />}
            <button className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50" onClick={() => void carregarDados()} type="button">
              Atualizar dados
            </button>
          </header>

          {error && <Alert tone="error">{error}</Alert>}
          {message && <Alert tone="success">{message}</Alert>}
          {loading ? <p className="text-sm text-stone-500">Carregando dados do Firestore…</p> : null}

          {!loading && !error && tab === "home" && (
            <SalonHome funcionarios={funcionarios} atendimentos={atendimentos} />
          )}

          {!loading && tab === "funcionarios" && (
            <EntityScreen
              description="Cadastre e acompanhe os barbeiros ativos do salão."
              empty="Nenhum funcionário cadastrado."
              form={<FuncionarioForm onSubmit={handleCreateFuncionario} />}
              rows={funcionarios.map((funcionario) => [funcionario.nome, funcionario.email, funcionario.cargo, typeof funcionario.percentualComissao === "number" && Number.isFinite(funcionario.percentualComissao) && funcionario.percentualComissao >= 0 && funcionario.percentualComissao <= 100 ? `${funcionario.percentualComissao.toLocaleString("pt-BR", { maximumFractionDigits: 20 })}%` : "Não cadastrada", funcionario.ativo ? "Ativo" : "Inativo", <FuncionarioAcoes key={funcionario.id} funcionario={funcionario} onSaved={handleActionSaved} />])}
              headers={["Nome", "E-mail", "Cargo", "Comissão", "Status", "Ações"]}
            />
          )}

          {!loading && tab === "servicos" && (
            <EntityScreen
              description="Defina os serviços e valores do salão."
              empty="Nenhum serviço cadastrado."
              form={<ServicoForm onSubmit={handleCreateServico} />}
              rows={servicos.map((servico) => [servico.nome, currency.format(servico.valor), <ServicoAcoes key={servico.id} servico={servico} onSaved={handleActionSaved} />])}
              headers={["Serviço", "Valor", "Ações"]}
            />
          )}

          {!loading && tab === "atendimentos" && (
            <AtendimentosScreen funcionarios={funcionarios} servicos={servicos} atendimentos={atendimentos} funcionarioFiltro={funcionarioFiltro} onSaved={async (os, action) => {
              setMessage(action === "delete" ? "Atendimento excluído. A numeração das OS foi preservada." : action === "edit" ? `Atendimento atualizado (${formatarOS(os)}).` : "Atendimento registrado com sucesso! O atendimento foi salvo com a OS " + formatarOS(os) + ".");
              await carregarDados();
            }} />
          )}

          {!loading && tab === "comissoes" && (
            <ComissoesScreen funcionarios={funcionarios} filtros={filtrosComissao} onChange={setFiltrosComissao} />
          )}
        </section>
      </div>

    </main>
  );
}

function EntityScreen({ description, form, headers, rows, empty }: { description: string; form: React.ReactNode; headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return <div className="space-y-7"><p className="max-w-2xl text-sm leading-6 text-stone-600">{description}</p><section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200">{form}</section><Table headers={headers} rows={rows} empty={empty} /></div>;
}

function Table({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr>{headers.map((header) => <th className="px-5 py-4 font-semibold" key={header}>{header}</th>)}</tr></thead><tbody className="divide-y divide-stone-100">{rows.length ? rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className="px-5 py-4 text-stone-700" key={cellIndex}>{cell}</td>)}</tr>) : <tr><td className="px-5 py-8 text-center text-stone-500" colSpan={headers.length}>{empty}</td></tr>}</tbody></table></div></div>;
}

function FuncionarioForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" onSubmit={onSubmit}><Input name="nome" label="Nome do funcionário" /><Input name="email" label="E-mail" type="email" /><Input name="percentualComissao" label="Comissão (%)" type="number" min="0" max="100" step="any" required /><Submit label="Cadastrar funcionário" /></form>; }
function ServicoForm({ onSubmit }: { onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { return <form className="grid gap-4 sm:grid-cols-3" onSubmit={onSubmit}><Input name="nome" label="Nome do serviço" /><Input name="valor" label="Valor (R$)" min="0" step="0.01" type="number" /><Submit label="Cadastrar serviço" /></form>; }

function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) { return <label className="grid gap-1.5 text-sm font-medium text-stone-700"><span>{label}</span><input className="h-11 rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100" required={props.required ?? true} {...props} /></label>; }
function Submit({ label, disabled = false }: { label: string; disabled?: boolean }) { return <button className="mt-auto h-11 rounded-lg bg-stone-950 px-4 text-sm font-bold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300" disabled={disabled} type="submit">{label}</button>; }
function Alert({ children, tone }: { children: string; tone: "error" | "success" }) { return <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div>; }
function getErrorMessage(error: unknown) { return error instanceof Error ? error.message : "Não foi possível concluir a operação."; }
