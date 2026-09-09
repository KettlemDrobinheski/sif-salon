"use client";

import { useRef, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Modal } from "@/components/Modal";
import { criarServico, type ServicoDocument } from "@/lib/firestore-collections";
import { atualizarDocumento, removerDocumento } from "@/lib/firestore-client";

const fieldClass = "h-11 w-full rounded-lg border border-stone-300 px-3 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-100";
const cancelClass = "rounded-lg border border-stone-300 px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function ServicoAcoes({ servico, onSaved }: {
  servico: ServicoDocument & { id: string };
  onSaved: (message: string) => Promise<void>;
}) {
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  function close() {
    if (!busy.current) { setMode(null); setError(""); }
  }

  async function execute(action: () => Promise<void>, message: string) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await action();
      setMode(null);
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
      if (!nome) throw new Error("Informe o nome do serviço.");
      const value = String(data.get("valor") ?? "").trim();
      const valid = criarServico(nome, value === "" ? NaN : Number(value));
      await atualizarDocumento<ServicoDocument>("servicos", servico.id, { nome: valid.nome, valor: valid.valor });
    }, "Serviço atualizado.");
  }

  return <>
    <div className="flex items-center gap-2">
      <button type="button" title="Editar serviço" aria-label={`Editar ${servico.nome}`} className="rounded-lg p-2 text-stone-600 hover:bg-amber-100 hover:text-amber-800 focus-visible:outline-2 focus-visible:outline-amber-500" onClick={() => { setError(""); setMode("edit"); }}><Pencil className="h-4 w-4" /></button>
      <button type="button" title="Excluir serviço" aria-label={`Excluir ${servico.nome}`} className="rounded-lg p-2 text-red-600 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-500" onClick={() => { setError(""); setMode("delete"); }}><Trash2 className="h-4 w-4" /></button>
    </div>
    {mode === "edit" && <Modal title="Editar serviço" onClose={close}>
      <form onSubmit={edit} className="space-y-4">
        <fieldset disabled={pending} className="space-y-4 disabled:opacity-60">
          <label className="grid gap-1.5 text-sm font-medium">Nome do serviço<input className={fieldClass} name="nome" defaultValue={servico.nome} required /></label>
          <label className="grid gap-1.5 text-sm font-medium">Valor (R$)<input className={fieldClass} name="valor" type="number" min="0" step="0.01" defaultValue={servico.valor} required /></label>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2 pt-2"><button type="button" className={cancelClass} disabled={pending} onClick={close}>Cancelar</button><button type="submit" disabled={pending} className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold disabled:opacity-50">{pending ? "Salvando…" : "Salvar alterações"}</button></div>
      </form>
    </Modal>}
    {mode === "delete" && <Modal title="Excluir serviço" onClose={close}>
      <p className="text-sm leading-6">Excluir o cadastro de <strong>{servico.nome}</strong>? Esta ação não pode ser desfeita.</p>
      <p className="mt-3 text-sm leading-6 text-stone-600">Os atendimentos já registrados, seus valores e suas OS serão mantidos.</p>
      <form onSubmit={(event) => { event.preventDefault(); void execute(() => removerDocumento("servicos", servico.id), "Serviço excluído."); }} className="mt-5">
        {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={cancelClass} disabled={pending} onClick={close}>Cancelar</button><button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{pending ? "Excluindo…" : "Excluir serviço"}</button></div>
      </form>
    </Modal>}
  </>;
}
