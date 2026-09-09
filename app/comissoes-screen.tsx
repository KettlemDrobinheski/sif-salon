"use client";

import { useEffect, useState } from "react";
import type { ComissaoDocument, FuncionarioDocument } from "@/lib/firestore-collections";
import { observarComissaoPorPeriodo } from "@/lib/firestore-client";

export type FiltrosComissao = { funcionarioId: string; inicio: string; fim: string };
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const field = "h-11 rounded-lg border border-stone-300 bg-white px-3 outline-none transition focus:border-amber-500 focus:ring-2 focus:ring-amber-100";
const label = "grid gap-1.5 text-sm font-medium text-stone-700";

export default function ComissoesScreen({ funcionarios, filtros, onChange }: {
  funcionarios: (FuncionarioDocument & { id: string })[];
  filtros: FiltrosComissao;
  onChange: (filtros: FiltrosComissao) => void;
}) {
  const { funcionarioId, inicio, fim } = filtros;
  const key = JSON.stringify([funcionarioId, inicio, fim]);
  const [result, setResult] = useState<{ key: string; resumo?: ComissaoDocument; error?: string } | null>(null);
  const ready = Boolean(funcionarioId && inicio && fim && inicio <= fim);

  useEffect(() => {
    if (!ready) return;
    // Mantém as mesmas fronteiras UTC usadas pela consulta anterior.
    return observarComissaoPorPeriodo(funcionarioId, `${inicio}T00:00:00.000Z`, `${fim}T23:59:59.999Z`,
      (resumo) => setResult({ key, resumo }),
      (cause) => setResult({ key, error: cause.message }),
    );
  }, [funcionarioId, inicio, fim, key, ready]);

  const resumo = ready && result?.key === key ? result.resumo : undefined;
  const error = inicio && fim && inicio > fim ? "Informe um período de datas válido." : ready && result?.key === key ? result.error : undefined;

  return <div className="space-y-7">
    <p className="max-w-2xl text-sm leading-6 text-stone-600">Consulte o total de serviços e comissão de cada barbeiro por período.</p>
    <form className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200 sm:grid-cols-4" onSubmit={(event) => event.preventDefault()}>
      <label className={label}><span>Funcionário</span><select name="funcionarioId" className={field} required value={funcionarioId} onChange={(event) => onChange({ ...filtros, funcionarioId: event.target.value })}><option disabled value="">Selecione</option>{funcionarios.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label className={label}><span>Início</span><input name="inicioPeriodo" className={field} required type="date" value={inicio} onChange={(event) => onChange({ ...filtros, inicio: event.target.value })} /></label>
      <label className={label}><span>Fim</span><input name="fimPeriodo" className={field} required type="date" value={fim} onChange={(event) => onChange({ ...filtros, fim: event.target.value })} /></label>
      <button className="mt-auto flex h-11 w-11 items-center justify-center rounded-lg border border-stone-300 text-stone-600 transition hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-amber-500" type="button" title="Limpar filtros" aria-label="Limpar funcionário, início e fim" onClick={() => { setResult(null); onChange({ funcionarioId: "", inicio: "", fim: "" }); }}>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </form>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {ready && result?.key !== key && <p role="status" className="text-sm text-stone-500">Atualizando comissões…</p>}
    {resumo && <div className="grid gap-4 sm:grid-cols-3" aria-live="polite">{[
      ["Atendimentos", String(resumo.totalAtendimentos)],
      ["Valor dos serviços", currency.format(resumo.valorTotalServicos)],
      ["Comissão total", currency.format(resumo.valorTotalComissao)],
    ].map(([title, value]) => <div key={title} className="rounded-2xl bg-stone-950 p-5 text-white"><p className="text-sm text-stone-400">{title}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>)}</div>}
  </div>;
}
