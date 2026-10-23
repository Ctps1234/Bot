"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Filter,
  FileText,
  Plus,
  X,
} from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SearchInput, Select } from "@/components/ui/input";
import { FinancialBadge, PlateTag, StatusBadge } from "@/components/orders/status-badge";
import { api, qs } from "@/lib/api-client";
import { cn, daysSince, formatDate, formatMoney } from "@/lib/utils";
import {
  FIN_LABEL,
  type FinancialStatus,
  type OrderStatus,
} from "@/lib/types";

export interface OrderListRow {
  id: number;
  number: string;
  status: OrderStatus;
  entryDate: string;
  expectedFinish: string | null;
  deliveredAt: string | null;
  totalCents: number;
  paidCents: number;
  financialStatus: FinancialStatus;
  clientName: string;
  vehiclePlate: string;
  vehicleLabel: string;
  reportedIssue: string;
  technicianName: string | null;
}

const STATUS_TABS: { value: OrderStatus | "TODAS" | "ATIVAS"; label: string }[] = [
  { value: "ATIVAS", label: "Em andamento" },
  { value: "ABERTA", label: "Abertas" },
  { value: "EM_EXECUCAO", label: "Em execução" },
  { value: "CONCLUIDA", label: "Concluídas" },
  { value: "ENTREGUE", label: "Entregues" },
  { value: "CANCELADA", label: "Canceladas" },
  { value: "TODAS", label: "Todas" },
];

export function OrdersView({
  serverRows,
  total,
  breakdown,
  initial,
}: {
  serverRows: OrderListRow[];
  total: number;
  breakdown: { status: OrderStatus; count: number }[];
  initial: { q: string; status: OrderStatus | "TODAS" | "ATIVAS"; financialStatus: FinancialStatus | "TODAS" };
  technicians?: { id: number; name: string }[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState(initial.status);
  const [fin, setFin] = useState(initial.financialStatus);
  const [rows, setRows] = useState<OrderListRow[]>(serverRows);
  const [loading, setLoading] = useState(false);

  const activeCount = useMemo(
    () =>
      breakdown
        .filter((b) => ["ABERTA", "EM_EXECUCAO", "CONCLUIDA"].includes(b.status))
        .reduce((s, b) => s + b.count, 0),
    [breakdown],
  );

  const fetchRows = useCallback(
    async (query: string, st: string, financial: string) => {
      setLoading(true);
      try {
        const data = await api.get<{ rows: OrderListRow[]; total: number }>(
          `/api/orders${qs({ q: query, status: st, financialStatus: financial, limit: 200 })}`,
        );
        setRows(data.rows);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // busca com debounce + sincronização com a URL
  useEffect(() => {
    const handle = setTimeout(() => {
      fetchRows(q, status, fin);
      const url = `/os${qs({ q, status: status === "TODAS" ? undefined : status, fin: fin === "TODAS" ? undefined : fin })}`;
      window.history.replaceState(null, "", url);
    }, 280);
    return () => clearTimeout(handle);
  }, [q, status, fin, fetchRows]);

  // navegação vinda de outra tela (ex.: filtro do painel)
  useEffect(() => {
    const nextStatus = (searchParams.get("status") ?? "TODAS") as OrderStatus | "TODAS" | "ATIVAS";
    const nextQ = searchParams.get("q") ?? "";
    if (nextStatus !== status || nextQ !== q) {
      setStatus(nextStatus);
      setQ(nextQ);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function clearFilters() {
    setQ("");
    setStatus("TODAS");
    setFin("TODAS");
  }

  const hasFilters = Boolean(q) || status !== "TODAS" || fin !== "TODAS";

  return (
    <>
      <PageHeader
        title="Ordens de Serviço"
        subtitle={`${activeCount} em andamento · ${total} no total`}
        actions={
          <Link href="/os/nova">
            <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
              Nova OS
            </Button>
          </Link>
        }
      />

      <Card padded={false}>
        {/* abas de status */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2 scrollbar-thin">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "TODAS"
                ? breakdown.reduce((s, b) => s + b.count, 0)
                : tab.value === "ATIVAS"
                  ? activeCount
                  : (breakdown.find((b) => b.status === tab.value)?.count ?? 0);
            const active = status === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setStatus(tab.value)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                  active
                    ? "bg-navy-900 text-white shadow-sm"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
                )}
              >
                {tab.label}
                <span
                  className={cn(
                    "tnum rounded px-1 text-[10px] font-bold",
                    active ? "bg-white/18 text-brand-300" : "bg-slate-100 text-slate-500",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5 sm:px-4">
          <SearchInput
            className="min-w-[14rem] flex-1"
            placeholder="Buscar por nº da OS, cliente, placa, modelo ou defeito…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <Select
              className="h-9 w-40 py-0 text-xs"
              value={fin}
              onChange={(e) => setFin(e.target.value as FinancialStatus | "TODAS")}
            >
              <option value="TODAS">Pagamento: todos</option>
              {(Object.keys(FIN_LABEL) as FinancialStatus[]).map((f) => (
                <option key={f} value={f}>
                  {FIN_LABEL[f]}
                </option>
              ))}
            </Select>
            {hasFilters ? (
              <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={clearFilters}>
                Limpar
              </Button>
            ) : null}
          </div>
        </div>

        {/* tabela */}
        {rows.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-5 w-5" />}
            title={hasFilters ? "Nenhuma OS encontrada" : "Nenhuma ordem de serviço ainda"}
            description={
              hasFilters
                ? "Ajuste a busca ou os filtros para encontrar o que procura."
                : "Crie a primeira OS para começar a controlar os serviços da oficina."
            }
            action={
              hasFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Link href="/os/nova">
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                    Nova OS
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div className={cn("overflow-x-auto scrollbar-thin transition-opacity", loading && "opacity-55")}>
            <table className="table-base min-w-[58rem]">
              <thead>
                <tr>
                  <th className="w-28">OS</th>
                  <th>Cliente</th>
                  <th>Veículo</th>
                  <th>Defeito relatado</th>
                  <th className="w-32">Status</th>
                  <th className="w-32">Entrada</th>
                  <th className="w-32">Pagamento</th>
                  <th className="w-28 text-right">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const overdue =
                    o.expectedFinish &&
                    ["ABERTA", "EM_EXECUCAO"].includes(o.status) &&
                    (daysSince(o.expectedFinish) ?? 0) > 0;
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/os/${o.id}`)}
                    >
                      <td>
                        <span className="font-bold text-slate-900">{o.number}</span>
                        {o.technicianName ? (
                          <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                            {o.technicianName}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[12rem] truncate font-medium text-slate-800">
                        {o.clientName}
                      </td>
                      <td className="whitespace-nowrap">
                        <PlateTag plate={o.vehiclePlate} />
                        {o.vehicleLabel ? (
                          <span className="ml-1.5 text-xs text-slate-500">{o.vehicleLabel}</span>
                        ) : null}
                      </td>
                      <td className="max-w-[16rem]">
                        <span className="line-clamp-2 text-xs text-slate-600">
                          {o.reportedIssue || "—"}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="whitespace-nowrap text-slate-600">
                        {formatDate(o.entryDate)}
                        {o.expectedFinish ? (
                          <span
                            className={cn(
                              "mt-0.5 flex items-center gap-1 text-[11px]",
                              overdue ? "font-semibold text-amber-700" : "text-slate-400",
                            )}
                          >
                            {overdue ? (
                              <AlertCircle className="h-3 w-3" />
                            ) : (
                              <CalendarClock className="h-3 w-3" />
                            )}
                            prev. {formatDate(o.expectedFinish)}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <FinancialBadge status={o.financialStatus} paidCents={o.paidCents} />
                      </td>
                      <td className="tnum text-right font-semibold text-slate-900">
                        {formatMoney(o.totalCents)}
                      </td>
                      <td>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {rows.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
            <span>
              {rows.length} OS exibida(s)
              {rows.length < total ? ` de ${total}` : ""}
            </span>
            <span className="tnum font-semibold text-slate-700">
              Total: {formatMoney(rows.reduce((s, o) => s + (o.status === "CANCELADA" ? 0 : o.totalCents), 0))}
            </span>
          </div>
        ) : null}
      </Card>

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <Badge tone="info">Dica</Badge>
        Clique em qualquer linha para abrir a OS, lançar peças, serviços e pagamentos.
      </div>
    </>
  );
}
