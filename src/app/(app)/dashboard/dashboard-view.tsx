"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarClock,
  Car,
  CheckCircle2,
  CircleDot,
  FileText,
  Hammer,
  PlayCircle,
  Plus,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KeyValue, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatDate, formatMoney, relativeDay } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE, type OrderStatus } from "@/lib/types";

export interface DashboardKpis {
  openOrders: number;
  runningOrders: number;
  finishedOrders: number;
  deliveredThisMonth: number;
  monthRevenueCents: number;
  receivedThisMonthCents: number;
  monthOrders: number;
  receivableCents: number;
  avgTicketCents: number;
  overdueOrders: number;
  activeOrders: number;
  clients: number;
  vehicles: number;
  monthFrom: string;
  monthTo: string;
}

export interface OrderRow {
  id: number;
  number: string;
  status: OrderStatus;
  entryDate: string;
  expectedFinish: string | null;
  totalCents: number;
  paidCents: number;
  financialStatus: "PENDENTE" | "PARCIAL" | "PAGO";
  clientName: string;
  vehiclePlate: string;
  vehicleLabel: string;
  reportedIssue?: string;
}

export function DashboardView({
  kpis,
  recentOrders,
  activeOrders,
  overdueOrders,
  statusBreakdown,
  workshopName,
}: {
  kpis: DashboardKpis;
  recentOrders: OrderRow[];
  activeOrders: OrderRow[];
  overdueOrders: Pick<OrderRow, "id" | "number" | "expectedFinish" | "clientName" | "vehiclePlate" | "status">[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  workshopName: string;
}) {
  const router = useRouter();
  const now = new Date();
  const greeting =
    now.getHours() < 12 ? "Bom dia" : now.getHours() < 18 ? "Boa tarde" : "Boa noite";

  const maxStatus = Math.max(1, ...statusBreakdown.map((s) => s.count));
  const activeFlow: OrderStatus[] = ["ABERTA", "EM_EXECUCAO", "CONCLUIDA", "ENTREGUE"];

  return (
    <>
      <PageHeader
        title={`${greeting} 👋`}
        subtitle={`${workshopName} · ${formatDate(new Date())}`}
        actions={
          <>
            <Button
              variant="primary"
              icon={<Plus className="h-4 w-4" />}
              onClick={() => router.push("/os/nova")}
            >
              Nova OS
            </Button>
            <Button icon={<Users className="h-4 w-4" />} onClick={() => router.push("/clientes")}>
              Clientes
            </Button>
          </>
        }
      />

      {/* KPIs principais */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Receita do mês"
          value={formatMoney(kpis.monthRevenueCents)}
          hint={`${kpis.monthOrders} OS em ${formatDate(kpis.monthFrom)} – ${formatDate(kpis.monthTo)}`}
          icon={<TrendingUp className="h-4.5 w-4.5" />}
          tone="brand"
        />
        <Stat
          label="Recebido no mês"
          value={formatMoney(kpis.receivedThisMonthCents)}
          hint={`Em aberto: ${formatMoney(kpis.receivableCents)}`}
          icon={<Wallet className="h-4.5 w-4.5" />}
          tone="success"
        />
        <Stat
          label="OS em andamento"
          value={kpis.activeOrders}
          hint={`${kpis.openOrders} abertas · ${kpis.runningOrders} em execução`}
          icon={<Wrench className="h-4.5 w-4.5" />}
          tone="info"
        />
        <Stat
          label="Ticket médio"
          value={formatMoney(kpis.avgTicketCents)}
          hint={`${kpis.deliveredThisMonth} entregas no mês`}
          icon={<Banknote className="h-4.5 w-4.5" />}
          tone="neutral"
        />
      </div>

      {/* Alerta de atraso */}
      {overdueOrders.length > 0 ? (
        <Card className="mt-4 border-l-4 border-l-amber-400 bg-amber-50/60">
          <div className="flex flex-wrap items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {overdueOrders.length} OS com previsão de entrega vencida
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {overdueOrders.slice(0, 6).map((o) => (
                  <Link
                    key={o.id}
                    href={`/os/${o.id}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200 ring-inset transition hover:bg-amber-100"
                  >
                    <span className="font-bold">{o.number}</span>
                    <span className="text-amber-700">{o.vehiclePlate}</span>
                    <span className="text-amber-600/80">{relativeDay(o.expectedFinish)}</span>
                  </Link>
                ))}
                {overdueOrders.length > 6 ? (
                  <span className="inline-flex items-center px-2 py-1 text-xs text-amber-700">
                    +{overdueOrders.length - 6}
                  </span>
                ) : null}
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => router.push("/os?status=ATIVAS")}>
              Ver todas
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {/* OS em andamento */}
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Serviços na oficina"
              subtitle="Ordens de serviço abertas, em execução ou aguardando retirada"
              icon={<CircleDot className="h-4.5 w-4.5" />}
              action={
                <Link
                  href="/os"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 transition hover:text-brand-600"
                >
                  Ver todas <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
              className="mb-3"
            />

            {activeOrders.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Nenhuma OS em andamento"
                description="Abra uma nova ordem de serviço para começar a registrar os serviços da oficina."
                action={
                  <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => router.push("/os/nova")}>
                    Abrir OS
                  </Button>
                }
              />
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5 scrollbar-thin">
                <table className="table-base min-w-[42rem]">
                  <thead>
                    <tr>
                      <th>OS</th>
                      <th>Cliente / Veículo</th>
                      <th>Status</th>
                      <th>Entrada</th>
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map((o) => (
                      <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/os/${o.id}`)}>
                        <td className="font-bold text-slate-900">{o.number}</td>
                        <td>
                          <p className="font-medium text-slate-800">{o.clientName}</p>
                          <p className="text-xs text-slate-500">
                            {o.vehicleLabel || "—"} · {o.vehiclePlate}
                          </p>
                        </td>
                        <td>
                          <Badge tone={STATUS_TONE[o.status]} dot>
                            {STATUS_LABEL[o.status]}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap text-slate-600">
                          {formatDate(o.entryDate)}
                          {o.expectedFinish ? (
                            <span className="ml-1 text-xs text-slate-400">
                              · prev. {formatDate(o.expectedFinish)}
                            </span>
                          ) : null}
                        </td>
                        <td className="tnum text-right font-semibold text-slate-900">
                          {formatMoney(o.totalCents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>

        {/* Fluxo + atalhos */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Fluxo da oficina" icon={<Hammer className="h-4.5 w-4.5" />} className="mb-3" />
            <div className="space-y-2.5">
              {activeFlow.map((status) => {
                const count = statusBreakdown.find((s) => s.status === status)?.count ?? 0;
                const icons: Record<string, typeof PlayCircle> = {
                  ABERTA: FileText,
                  EM_EXECUCAO: Wrench,
                  CONCLUIDA: CheckCircle2,
                  ENTREGUE: Car,
                };
                const Icon = icons[status] ?? CircleDot;
                return (
                  <Link
                    key={status}
                    href={`/os?status=${status}`}
                    className="group flex items-center gap-3 rounded-lg border border-transparent px-2 py-1.5 transition hover:border-line hover:bg-slate-50"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-sm font-medium text-slate-700">
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="tnum text-sm font-bold text-slate-900">{count}</span>
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-400 transition-all"
                        style={{ width: `${Math.round((count / maxStatus) * 100)}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Resumo" icon={<CalendarClock className="h-4.5 w-4.5" />} className="mb-3" />
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Clientes" value={<span className="tnum font-bold">{kpis.clients}</span>} />
              <KeyValue label="Veículos" value={<span className="tnum font-bold">{kpis.vehicles}</span>} />
              <KeyValue
                label="A receber"
                value={
                  <span className={cn("tnum font-bold", kpis.receivableCents > 0 ? "text-red-600" : "text-emerald-600")}>
                    {formatMoney(kpis.receivableCents)}
                  </span>
                }
              />
              <KeyValue
                label="Atrasadas"
                value={
                  <span className={cn("tnum font-bold", kpis.overdueOrders > 0 ? "text-amber-600" : "")}>
                    {kpis.overdueOrders}
                  </span>
                }
              />
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" onClick={() => router.push("/financeiro")}>
                Financeiro
              </Button>
              <Button size="sm" variant="outline" onClick={() => router.push("/relatorios")}>
                Relatórios
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Últimas movimentações */}
      <Card className="mt-4" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Últimas movimentações"
            subtitle="Ordens de serviço criadas ou atualizadas recentemente"
            icon={<FileText className="h-4.5 w-4.5" />}
            className="mb-3"
          />
          {recentOrders.length === 0 ? (
            <EmptyState
              title="Nada por aqui ainda"
              description="Assim que você abrir a primeira OS, ela aparece nesta lista."
            />
          ) : (
            <div className="-mx-4 overflow-x-auto sm:-mx-5 scrollbar-thin">
              <table className="table-base min-w-[46rem]">
                <thead>
                  <tr>
                    <th>OS</th>
                    <th>Cliente</th>
                    <th>Veículo</th>
                    <th>Status</th>
                    <th>Pagamento</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/os/${o.id}`)}>
                      <td className="font-bold text-slate-900">{o.number}</td>
                      <td className="text-slate-700">{o.clientName}</td>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-slate-700">
                          {o.vehiclePlate}
                        </span>
                        <span className="ml-1.5 text-xs text-slate-500">{o.vehicleLabel}</span>
                      </td>
                      <td>
                        <Badge tone={STATUS_TONE[o.status]}>{STATUS_LABEL[o.status]}</Badge>
                      </td>
                      <td>
                        <Badge
                          tone={
                            o.financialStatus === "PAGO"
                              ? "success"
                              : o.financialStatus === "PARCIAL"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {o.financialStatus === "PAGO"
                            ? "Pago"
                            : o.financialStatus === "PARCIAL"
                              ? `Parcial (${formatMoney(o.paidCents)})`
                              : "Em aberto"}
                        </Badge>
                      </td>
                      <td className="tnum text-right font-semibold text-slate-900">
                        {formatMoney(o.totalCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
