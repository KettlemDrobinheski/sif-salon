"use client";

import { useRef, useState, type FormEvent } from "react";
import { criarFuncionario, type FuncionarioDocument } from "@/lib/firestore-collections";
import { atualizarDocumento, removerDocumento } from "@/lib/firestore-client";

const dialogClass = "m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-stone-900 shadow-xl backdrop:bg-black/40";
const fieldClass = "h-11 w-full rounded-lg border border-stone-300 px-3 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100";
const cancelClass = "rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function FuncionarioAcoes({ funcionario, onSaved }: {
  funcionario: FuncionarioDocument & { id: string };
  onSaved: (message: string) => Promise<void>;
}) {
  const editDialog = useRef<HTMLDialogElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const hasCommission = funcionario.percentualComissao != null;

  async function execute(action: () => Promise<void>, dialog: HTMLDialogElement | null, message: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await action();
      dialog?.close();
      await onSaved(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível concluir a operação.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void execute(async () => {
      const nome = String(data.get("nome") ?? "").trim();
      const email = String(data.get("email") ?? "").trim();
      if (!nome || !email) throw new Error("Informe nome e e-mail do funcionário.");
      const value = String(data.get("percentualComissao") ?? "").trim();
      const changes: Partial<FuncionarioDocument> = { nome, email };
      if (value !== "" || hasCommission) {
        const valid = criarFuncionario(nome, email, value === "" ? NaN : Number(value));
        changes.percentualComissao = valid.percentualComissao;
      }
      await atualizarDocumento<FuncionarioDocument>("funcionarios", funcionario.id, changes);
    }, editDialog.current, "Funcionário atualizado.");
  }

  function remove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void execute(() => removerDocumento("funcionarios", funcionario.id), deleteDialog.current, "Funcionário excluído.");
  }

  return <>
    <div className="flex items-center gap-2">
      <button type="button" title="Editar funcionário" aria-label={`Editar ${funcionario.nome}`} className="rounded-lg p-2 text-stone-600 hover:bg-amber-100 hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-amber-500" onClick={() => { setError(""); editDialog.current?.querySelector("form")?.reset(); editDialog.current?.showModal(); }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" /></svg>
      </button>
      <button type="button" title="Excluir funcionário" aria-label={`Excluir ${funcionario.nome}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-500" onClick={() => { setError(""); deleteDialog.current?.showModal(); }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg>
      </button>
    </div>
    <dialog ref={editDialog} className={dialogClass} aria-labelledby={`edit-${funcionario.id}`} onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 id={`edit-${funcionario.id}`} className="text-xl font-bold">Editar funcionário</h2>
        <button type="button" aria-label="Fechar edição de funcionário" disabled={pending} className="shrink-0 rounded-lg px-2 text-2xl text-stone-500 hover:bg-stone-100 disabled:opacity-50" onClick={() => { if (!busy.current) editDialog.current?.close(); }}>×</button>
      </div>
      <form onSubmit={edit} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
          <label className="grid gap-1.5 text-sm font-medium">Nome do funcionário<input className={fieldClass} name="nome" defaultValue={funcionario.nome} required /></label>
          <label className="grid gap-1.5 text-sm font-medium">E-mail<input className={fieldClass} name="email" type="email" defaultValue={funcionario.email} required /></label>
          <label className="grid gap-1.5 text-sm font-medium">Comissão (%)<input className={fieldClass} name="percentualComissao" type="number" min="0" max="100" step="any" defaultValue={funcionario.percentualComissao ?? ""} required={hasCommission} /></label>
          {!hasCommission && <p className="text-xs text-stone-500">Este cadastro ainda não possui comissão. Preencha para cadastrá-la ou deixe em branco para manter como está.</p>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={cancelClass} disabled={pending} onClick={() => editDialog.current?.close()}>Cancelar</button><button type="submit" disabled={pending} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold disabled:opacity-50">{pending ? "Salvando…" : "Salvar alterações"}</button></div>
      </form>
    </dialog>
    <dialog ref={deleteDialog} className={dialogClass} aria-labelledby={`delete-${funcionario.id}`} onCancel={(event) => { if (pending) event.preventDefault(); }}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 id={`delete-${funcionario.id}`} className="text-xl font-bold">Excluir funcionário</h2>
        <button type="button" aria-label="Fechar exclusão de funcionário" disabled={pending} className="shrink-0 rounded-lg px-2 text-2xl text-stone-500 hover:bg-stone-100 disabled:opacity-50" onClick={() => { if (!busy.current) deleteDialog.current?.close(); }}>×</button>
      </div>
      <p className="text-sm leading-6">Excluir o cadastro de <strong>{funcionario.nome}</strong>? Esta ação não pode ser desfeita.</p>
      <p className="mt-3 text-sm leading-6 text-stone-600">Os atendimentos e suas OS serão mantidos, mas o nome passará a aparecer como “Funcionário removido” no histórico.</p>
      <form onSubmit={remove} className="mt-5">
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={cancelClass} disabled={pending} onClick={() => deleteDialog.current?.close()}>Cancelar</button><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Excluindo…" : "Excluir funcionário"}</button></div>
      </form>
    </dialog>
  </>;
}
