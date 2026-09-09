"use client";

import { useEffect, useRef, useState } from "react";
import type { AtendimentoDocument, FuncionarioDocument } from "@/lib/firestore-collections";
import { HomeIcon } from "./home-icons";
import styles from "./salon-home.module.css";
import { formatarOS } from "@/lib/ordem-servico";

type Funcionario = FuncionarioDocument & { id: string; percentualComissao?: number };
type Atendimento = AtendimentoDocument & { id: string };
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const tones = ["rose", "blue", "green", "violet"] as const;

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    const initial = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);
  return now;
}

export function HomeClock() {
  const now = useNow();
  return <div className={styles.clock}>
    <span><HomeIcon name="atendimentos" />{now ? <time dateTime={now.toISOString()}>{now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</time> : "Carregando data…"}</span>
    <span><HomeIcon name="clock" />{now ? <time dateTime={now.toISOString()}>{now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</time> : "—"}</span>
  </div>;
}

function dateParts(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ["Não informada", "Não informado"]
    : [date.toLocaleDateString("pt-BR"), date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })];
}

function commission(value: number, percent: number) {
  return Math.round(value * percent) / 100;
}

function Avatar({ name, index, small = false }: { name: string; index: number; small?: boolean }) {
  return <span aria-hidden="true" className={`${styles.avatar} ${styles[tones[index % tones.length]]} ${small ? styles.smallAvatar : ""}`}>{name.trim().charAt(0).toLocaleUpperCase("pt-BR") || "?"}</span>;
}

export default function SalonHome({ funcionarios, atendimentos }: {
  funcionarios: Funcionario[];
  atendimentos: Atendimento[];
}) {
  const now = useNow();
  const [selectedEmployee, setSelectedEmployee] = useState<Funcionario | null>(null);

  function openHistory(funcionario: Funcionario) {
    setSelectedEmployee(funcionario);
  }
  const sorted = [...atendimentos].sort((a, b) => (Date.parse(b.data) || 0) - (Date.parse(a.data) || 0));
  const today = now ? atendimentos.filter((item) => new Date(item.data).toDateString() === now.toDateString()) : [];

  return <div className={styles.home}>
    <section aria-label="Resumo do dia" className={styles.metrics}>
      <div className={styles.metric}><span className={`${styles.metricIcon} ${styles.violet}`}><HomeIcon name="servicos" /></span><div><p>Atendimentos hoje</p><strong>{now ? today.length : "—"}</strong></div></div>
      <div className={styles.metric}><span className={`${styles.metricIcon} ${styles.green}`}><HomeIcon name="money" /></span><div><p>Faturamento do dia</p><strong>{now ? money.format(today.reduce((total, item) => total + item.valor, 0)) : "—"}</strong></div></div>
    </section>

    <section aria-labelledby="home-funcionarios" className={styles.panel}>
      <div className={styles.sectionHeading}><h2 id="home-funcionarios">Funcionários</h2></div>
      {!funcionarios.length && <p className={styles.empty}>Nenhum funcionário cadastrado.</p>}
      <div className={styles.employeeGrid}>
        {funcionarios.map((funcionario, index) => {
          const employeeAppointments = sorted.filter((item) => item.funcionarioId === funcionario.id);
          const latest = employeeAppointments[0];
          const [date, time] = latest ? dateParts(latest.data) : [];
          const raw = funcionario.percentualComissao;
          const percent = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 100 ? raw : null;
          const total = employeeAppointments.reduce((sum, item) => sum + item.valor, 0);
          const payable = percent === null ? null : employeeAppointments.reduce((sum, item) => sum + commission(item.valor, percent), 0);
          return <article className={styles.employeeCard} key={funcionario.id}>
            <div className={styles.employeeHeading}>
              <Avatar name={funcionario.nome} index={index} />
              <div><h3>{funcionario.nome}</h3><p>Comissão: <strong>{percent === null ? "Não cadastrada" : `${percent.toLocaleString("pt-BR")}%`}</strong></p></div>
              <button type="button" className={styles.arrowButton} aria-label={`Ver atendimentos de ${funcionario.nome}`} onClick={() => openHistory(funcionario)}><HomeIcon name="arrow" /></button>
            </div>
            <h4 className={styles.recentTitle}>Último atendimento</h4>
            <div className={styles.latestAppointment}>
              {latest ? <>
                <p className={styles.latestService}><HomeIcon name="servicos" /><span>{latest.nomeServico}</span></p>
                <dl className={styles.latestDetails}>
                  <div><dt>Data</dt><dd>{date}</dd></div>
                  <div><dt>Horário</dt><dd>{time}</dd></div>
                  <div><dt>Valor do serviço</dt><dd>{money.format(latest.valor)}</dd></div>
                  <div><dt>Comissão</dt><dd>{percent === null ? <span className={styles.unavailable}>Indisponível</span> : <span className={styles.badge}>{money.format(commission(latest.valor, percent))}</span>}</dd></div>
                </dl>
              </> : <p className={styles.empty}>Nenhum atendimento registrado.</p>}
            </div>
            <div className={styles.totals}>
              <p><span>Total dos serviços</span><strong>{money.format(total)}</strong></p>
              <p><strong>Total a receber{percent === null ? "" : ` (${percent.toLocaleString("pt-BR")}%)`}</strong>{payable === null ? <span className={styles.unavailable}>Indisponível</span> : <strong className={styles.badge}>{money.format(payable)}</strong>}</p>
              {percent === null && <small>Porcentagem não informada no cadastro do funcionário.</small>}
            </div>
            <button className={styles.allAppointments} type="button" onClick={() => openHistory(funcionario)}><HomeIcon name="atendimentos" />Ver todos os atendimentos<span className="sr-only"> de {funcionario.nome}</span></button>
          </article>;
        })}
      </div>
      {funcionarios.length > 0 && <p className={styles.note}>Último atendimento por funcionário. Totais de todo o histórico carregado.</p>}
    </section>

    <EmployeeHistoryModal funcionario={selectedEmployee} atendimentos={atendimentos} onClose={() => setSelectedEmployee(null)} />
  </div>;
}

function EmployeeHistoryModal({ funcionario, atendimentos, onClose }: {
  funcionario: Funcionario | null;
  atendimentos: Atendimento[];
  onClose: () => void;
}) {
  const historyDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = historyDialog.current;
    if (funcionario && !dialog?.open) dialog?.showModal();
    else if (!funcionario && dialog?.open) dialog.close();
  }, [funcionario]);
  const employeeHistory = funcionario ? atendimentos
    .filter((item) => item.funcionarioId === funcionario.id)
    .sort((a, b) => ((b.dataEpochMs ?? Date.parse(b.data)) || 0) - ((a.dataEpochMs ?? Date.parse(a.data)) || 0)) : [];

  return <dialog ref={historyDialog} className={styles.historyModal} aria-labelledby="employee-history-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <div className={styles.historyModalHeader}>
        <h2 id="employee-history-title">{funcionario ? `Atendimentos — ${funcionario.nome}` : "Atendimentos"}</h2>
        <button type="button" aria-label="Fechar histórico de atendimentos" className={styles.historyModalClose} onClick={onClose}>×</button>
      </div>
      <div className={styles.historyModalBody} tabIndex={0} role="region" aria-label="Histórico do funcionário">
        <table className={styles.historyModalTable}>
          <thead><tr>{["OS", "Data", "Horário", "Cliente", "Serviços", "Valor total", "Comissão"].map((title) => <th key={title} scope="col">{title}</th>)}</tr></thead>
          <tbody>{employeeHistory.map((item) => {
            const [date, time] = dateParts(item.dataEpochMs == null ? item.data : new Date(item.dataEpochMs).toISOString());
            return <tr key={item.id}>{[
              formatarOS(item.os), date, time, item.clienteNome || "Não informado",
              item.servicos?.length ? item.servicos.map((service) => service.nome).join(", ") : item.nomeServico,
              money.format(item.valor), item.comissao == null ? "Indisponível" : money.format(item.comissao),
            ].map((value, index) => <td key={index}>{value}</td>)}</tr>;
          })}
          {!employeeHistory.length && <tr><td colSpan={7} className={styles.empty}>Nenhum atendimento encontrado para este funcionário.</td></tr>}
          </tbody>
        </table>
      </div>
    </dialog>;
}
