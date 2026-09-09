import type { ReactNode } from "react";

export type HomeIconName = "home" | "funcionarios" | "servicos" | "atendimentos" | "comissoes" | "money" | "clock" | "arrow";

export function HomeIcon({ name, className }: { name: HomeIconName; className?: string }) {
  const paths: Record<HomeIconName, ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h5v-7h4v7h5V9" /></>,
    funcionarios: <><circle cx="12" cy="7" r="4" /><path d="M4 21v-3a8 8 0 0 1 16 0v3Z" /></>,
    servicos: <><circle cx="5" cy="6" r="3" /><circle cx="5" cy="18" r="3" /><path d="m8 8 13 13M8 16 21 3M10 12l3-3" /></>,
    atendimentos: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M8 3v5m8-5v5M4 11h16m-12 5h3m3 0h2" /></>,
    comissoes: <><circle cx="12" cy="12" r="9" /><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12" /></>,
    money: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 8h1m10 8h1" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    arrow: <path d="M4 12h16m-5-5 5 5-5 5" />,
  };
  return <svg aria-hidden="true" className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
