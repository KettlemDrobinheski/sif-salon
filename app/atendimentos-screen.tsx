"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { AtendimentoDocument, FuncionarioDocument, ServicoDocument } from "@/lib/firestore-collections";
import { calcularComissao } from "@/lib/firestore-collections";
import { editarAtendimento, registrarAtendimento, removerDocumento } from "@/lib/firestore-client";
import { formatarOS } from "@/lib/ordem-servico";

type WithId<T> = T & { id: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const field = "h-11 min-w-0 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const label = "grid min-w-0 gap-1.5 text-sm font-medium text-stone-700";

function ActionIcon({ edit = false }: { edit?: boolean }) {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={edit ? "m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" : "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"} /></svg>;
}

function dateTime(item: AtendimentoDocument) {
  const date = new Date(item.dataEpochMs ?? item.data);
  return Number.isNaN(date.getTime()) ? ["Não informada", "Não informado"] : [date.toLocaleDateString("pt-BR"), date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })];
}

function timestamp(item: AtendimentoDocument) {
  const value = item.dataEpochMs ?? Date.parse(item.data);
  return Number.isFinite(value) ? value : 0;
}

export default function AtendimentosScreen({ funcionarios, servicos, atendimentos, funcionarioFiltro, onSaved }: {
  funcionarios: WithId<FuncionarioDocument>[];
  servicos: WithId<ServicoDocument>[];
  atendimentos: WithId<AtendimentoDocument>[];
  funcionarioFiltro: string | null;
  onSaved: (os: number | undefined, action?: "edit" | "delete") => Promise<void>;
}) {
  const [funcionarioId, setFuncionarioId] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [selections, setSelections] = useState([{ key: 0, id: "" }]);
  const [now, setNow] = useState<Date | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<WithId<AtendimentoDocument> | null>(null);
  const [deleting, setDeleting] = useState<WithId<AtendimentoDocument> | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const formSection = useRef<HTMLElement>(null);
  const busy = useRef(false);
  const nextKey = useRef(1);

  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  const historicalServices = editing ? (editing.servicos?.length ? editing.servicos : [{ servicoId: editing.servicoId, nome: editing.nomeServico, valor: editing.valor }]) : [];
  const activeServices = [...new Map([
    ...servicos.filter((item) => item.ativo).map((item) => [item.id, item] as const),
    ...historicalServices.map((item) => [item.servicoId, { id: item.servicoId, nome: item.nome, valor: item.valor }] as const),
  ]).values()];
  const selectedServices = selections.flatMap(({ id }) => {
    const service = activeServices.find((item) => item.id === id);
    return service ? [service] : [];
  });
  const total = selectedServices.reduce((sum, item) => sum + Math.round(item.valor * 100), 0) / 100;
  const employee = funcionarios.find((item) => item.id === funcionarioId && item.ativo);
  const raw = employee?.percentualComissao;
  const percent = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
  const valid = Boolean(employee && clienteNome.trim() && selectedServices.length === selections.length && selections.length > 0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    if (!valid) { setError("Informe funcionário, cliente e pelo menos um serviço. Preencha ou remova as seleções vazias."); return; }
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const input = { funcionarioId, clienteNome, servicoIds: selections.map((item) => item.id) };
      const result = editing ? await editarAtendimento(editing.id, input) : await registrarAtendimento(input);
      setFuncionarioId("");
      setClienteNome("");
      setSelections([{ key: nextKey.current++, id: "" }]);
      setEditing(null);
      await onSaved(result.os, editing ? "edit" : undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar o atendimento.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function reset() {
    setEditing(null); setFuncionarioId(""); setClienteNome("");
    setSelections([{ key: nextKey.current++, id: "" }]); setError("");
  }

  function startEditing(item: WithId<AtendimentoDocument>) {
    if (busy.current) return;
    setEditing(item); setFuncionarioId(item.funcionarioId); setClienteNome(item.clienteNome ?? ""); setError("");
    const services = item.servicos?.length ? item.servicos : [{ servicoId: item.servicoId }];
    setSelections(services.map((service) => ({ key: nextKey.current++, id: service.servicoId })));
    formSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function confirmDelete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deleting || busy.current) return;
    busy.current = true; setPending(true); setError("");
    try {
      await removerDocumento("atendimentos", deleting.id);
      if (editing?.id === deleting.id) reset();
      deleteDialog.current?.close();
      await onSaved(deleting.os, "delete");
      setDeleting(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível excluir o atendimento."); }
    finally { busy.current = false; setPending(false); }
  }

  const names = new Map(funcionarios.map((item) => [item.id, item.nome]));
  const history = atendimentos.filter((item) => funcionarioFiltro === null || item.funcionarioId === funcionarioFiltro)
    .sort((a, b) => timestamp(b) - timestamp(a));

  return <div className="min-w-0 space-y-7">
    <section ref={formSection} className="min-w-0 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200" aria-labelledby="novo-atendimento">
      <h2 id="novo-atendimento" className="mb-5 text-lg font-bold">{editing ? `Editando ${editing.os == null ? "atendimento sem OS" : `OS ${formatarOS(editing.os)}`}` : "Novo atendimento"}</h2>
      <form onSubmit={submit}>
        <fieldset disabled={pending} className="min-w-0 space-y-6 disabled:opacity-60">
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className={label}>Funcionário<select className={field} required value={funcionarioId} onChange={(event) => setFuncionarioId(event.target.value)}><option value="">Selecione</option>{funcionarios.filter((item) => item.ativo).map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
            <label className={label}>Nome do cliente<input className={field} name="clienteNome" required value={clienteNome} onChange={(event) => setClienteNome(event.target.value)} /></label>
            <div className={label}><span>Data e hora</span><p className="flex min-h-11 items-center rounded-lg bg-stone-50 px-3 text-sm">{editing ? dateTime(editing).join(" · ") : now ? <time dateTime={now.toISOString()}>{now.toLocaleDateString("pt-BR")} · {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time> : "Carregando horário…"}</p><span className="text-xs font-normal text-stone-500">{editing ? "Data original preservada." : "Registradas automaticamente ao salvar."}</span></div>
          </div>
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="min-w-0 space-y-3">
            <h3 className="text-sm font-bold">Serviços do atendimento</h3>
            {selections.map((selection, index) => {
              const service = activeServices.find((item) => item.id === selection.id);
              return <div key={selection.key} className="grid min-w-0 items-end gap-3 rounded-xl border border-stone-200 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <label className={label}>Serviço {index + 1}<select className={field} required value={selection.id} onChange={(event) => setSelections((items) => items.map((item) => item.key === selection.key ? { ...item, id: event.target.value } : item))}><option value="">Selecione</option>{activeServices.map((item) => <option key={item.id} value={item.id} disabled={selections.some((other) => other.key !== selection.key && other.id === item.id)}>{item.nome} · {money.format(item.valor)}</option>)}</select></label>
                <div className="text-sm"><p className="mb-1.5 text-stone-500">Valor</p><p className="flex h-11 items-center font-semibold">{money.format(service?.valor ?? 0)}</p></div>
                <button type="button" onClick={() => setSelections((items) => items.length === 1 ? [{ ...items[0], id: "" }] : items.filter((item) => item.key !== selection.key))} aria-label={`Remover serviço ${index + 1}`} title="Remover serviço da seleção" className="flex h-11 items-center justify-center rounded-lg px-3 text-red-600 hover:bg-red-50"><ActionIcon /></button>
              </div>;
            })}
            <button type="button" disabled={selections.length >= activeServices.length} onClick={() => { const key = nextKey.current++; setSelections((items) => [...items, { key, id: "" }]); }} className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-40">+ Adicionar mais um serviço</button>
            {!activeServices.length && <p className="text-sm text-stone-500">Nenhum serviço ativo disponível.</p>}
          </div>
          <div className="min-w-0 w-full rounded-xl bg-stone-50 p-4" aria-live="polite">
            <h3 className="mb-3 font-bold">Resumo do atendimento</h3>
            <p className="mb-2 text-sm">Total de serviços: {selectedServices.length}</p>
            <p className="mb-2 font-bold">Valor total: {money.format(total)}</p>
            <p className="mb-4 text-sm">Comissão{percent === null ? "" : ` (${percent}%)`}: {percent === null ? "Indisponível — porcentagem não cadastrada" : money.format(calcularComissao(total, percent))}</p>
            <button type="submit" disabled={!valid} className="w-full rounded-lg bg-amber-400 px-4 py-3 text-sm font-bold text-stone-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Salvando…" : editing ? "Salvar alterações" : "Registrar atendimento"}</button>
            {editing && <button type="button" onClick={reset} className="mt-2 w-full rounded-lg border border-stone-300 px-4 py-2 text-sm">Cancelar edição</button>}
          </div>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </form>
    </section>
    <section className="min-w-0" aria-labelledby="historico-atendimentos">
      <h2 id="historico-atendimentos" className="mb-4 text-lg font-bold">Histórico de atendimentos</h2>
      {funcionarioFiltro !== null && <p className="mb-3 text-sm text-stone-500">Funcionário: {names.get(funcionarioFiltro) ?? "Funcionário removido"}</p>}
      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-stone-200"><table className="w-full text-left text-sm">
        <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr>{["OS", "Data", "Horário", "Cliente", "Funcionário", "Serviços", "Valor", "Comissão", "Ações"].map((title) => <th scope="col" key={title} className="px-5 py-4 font-semibold">{title}</th>)}</tr></thead>
        <tbody className="divide-y divide-stone-100">{history.map((item) => <tr key={item.id}>{[formatarOS(item.os), ...dateTime(item), item.clienteNome || "Não informado", names.get(item.funcionarioId) ?? "Funcionário removido", item.servicos?.length ? item.servicos.map((service) => service.nome).join(", ") : item.nomeServico, money.format(item.valor), item.comissao == null ? "Indisponível" : money.format(item.comissao)].map((value, index) => <td className="px-5 py-4 text-stone-700" key={index}>{value}</td>)}<td className="px-5 py-4"><div className="flex gap-2"><button type="button" disabled={pending} aria-label={`Editar atendimento ${formatarOS(item.os)}`} title="Editar atendimento" className="rounded-lg p-2 text-stone-600 hover:bg-amber-100 disabled:opacity-40" onClick={() => startEditing(item)}><ActionIcon edit /></button><button type="button" disabled={pending} aria-label={`Excluir atendimento ${formatarOS(item.os)}`} title="Excluir atendimento" className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-40" onClick={() => { setDeleting(item); setError(""); deleteDialog.current?.showModal(); }}><ActionIcon /></button></div></td></tr>)}
          {!history.length && <tr><td colSpan={9} className="px-5 py-8 text-center text-stone-500">Nenhum atendimento registrado.</td></tr>}
        </tbody>
      </table></div>
    </section>
    <dialog ref={deleteDialog} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl backdrop:bg-black/40" aria-labelledby="excluir-atendimento" onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <h2 id="excluir-atendimento" className="mb-4 text-lg font-bold">Excluir atendimento</h2>
      <p className="text-sm">Tem certeza que deseja excluir {deleting?.os == null ? "este atendimento sem OS" : `a OS ${formatarOS(deleting.os)}`}?</p>
      <p className="mt-2 text-sm text-stone-600">Cliente: {deleting?.clienteNome || "Não informado"}. Esta ação não pode ser desfeita. A OS não será reutilizada.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <form onSubmit={confirmDelete} className="mt-5 flex justify-end gap-2"><button type="button" disabled={pending} className="rounded-lg border border-stone-300 px-4 py-2 text-sm" onClick={() => { deleteDialog.current?.close(); setDeleting(null); }}>Cancelar</button><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">{pending ? "Excluindo…" : "Excluir atendimento"}</button></form>
    </dialog>
  </div>;
}
