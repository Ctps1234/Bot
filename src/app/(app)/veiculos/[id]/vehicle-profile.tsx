"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Battery, FileText, Gauge, Plus, Wrench } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KeyValue, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FinancialBadge, PlateTag, StatusBadge } from "@/components/orders/status-badge";
import { formatDate, formatMoney, relativeDay } from "@/lib/utils";
import type { Client, FinancialStatus, OrderStatus, Vehicle } from "@/lib/types";

export interface VehicleOrderRow {
  id: number;
  number: string;
  status: OrderStatus;
  entryDate: string;
  expectedFinish: string | null;
  deliveredAt: string | null;
  totalCents: number;
  paidCents: number;
  financialStatus: FinancialStatus;
  reportedIssue: string;
  diagnosis: string;
  mileageIn: number | null;
  warrantyMonths: number;
  items: { kind: "PECA" | "SERVICO"; description: string; totalCents: number }[];
}

export function VehicleProfile({
  vehicle,
  client,
  orders,
  totals,
  topServices,
  lastMileage,
  lastVisit,
}: {
  vehicle: Vehicle;
  client: Client;
  orders: VehicleOrderRow[];
  totals: { orders: number; revenue: number; balance: number };
  topServices: { description: string; count: number; lastPriceCents: number }[];
  lastMileage: number | null;
  lastVisit: string | null;
}) {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <PlateTag plate={vehicle.plate} className="text-sm" />
            <span>{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}</span>
          </span>
        }
        subtitle={
          <Link href={`/clientes/${client.id}`} className="hover:underline">
            {client.name}
            {client.phone ? ` · ${client.phone}` : ""}
          </Link>
        }
        actions={
          <>
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push("/veiculos")}>
              Veículos
            </Button>
            <Link href={`/os/nova?vehicle=${vehicle.id}`}>
              <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                Abrir OS
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Última KM"
          value={lastMileage ? lastMileage.toLocaleString("pt-BR") : "—"}
          hint={lastVisit ? `registrada em ${formatDate(lastVisit)}` : "sem registros"}
          icon={<Gauge className="h-4.5 w-4.5" />}
          tone="info"
        />
        <Stat label="OS neste veículo" value={totals.orders} icon={<FileText className="h-4.5 w-4.5" />} tone="brand" />
        <Stat
          label="Total investido"
          value={formatMoney(totals.revenue)}
          hint={totals.orders > 0 ? `média ${formatMoney(Math.round(totals.revenue / totals.orders))}` : undefined}
          icon={<Wrench className="h-4.5 w-4.5" />}
        />
        <Stat
          label="Em aberto"
          value={formatMoney(totals.balance)}
          tone={totals.balance > 0 ? "danger" : "success"}
          icon={<Battery className="h-4.5 w-4.5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Dados do veículo" className="mb-3" />
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Placa" value={<PlateTag plate={vehicle.plate} />} />
              <KeyValue label="Sistema elétrico" value={vehicle.voltage} />
              <KeyValue label="Marca" value={vehicle.brand ?? "—"} />
              <KeyValue label="Modelo" value={vehicle.model ?? "—"} />
              <KeyValue label="Ano" value={vehicle.year ?? "—"} />
              <KeyValue label="Cor" value={vehicle.color ?? "—"} />
              {vehicle.fleetNumber ? <KeyValue label="Frota" value={vehicle.fleetNumber} /> : null}
            </dl>
            {vehicle.notes ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-2.5 ring-1 ring-line ring-inset">
                <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Observações
                </p>
                <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                  {vehicle.notes}
                </p>
              </div>
            ) : null}
            <Link href={`/clientes/${client.id}`} className="mt-3 block">
              <Button size="sm" variant="outline" className="w-full justify-center" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                Ficha do cliente
              </Button>
            </Link>
          </Card>

          <Card>
            <CardHeader
              title="Serviços recorrentes"
              subtitle="O que mais foi feito neste veículo"
              icon={<Wrench className="h-4.5 w-4.5" />}
              className="mb-3"
            />
            {topServices.length === 0 ? (
              <p className="text-xs text-slate-500">
                Nenhum serviço registrado ainda. Os serviços mais executados neste veículo
                aparecerão aqui — útil para identificar problemas elétricos reincidentes.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {topServices.map((s) => (
                  <li key={s.description} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate text-slate-700">{s.description}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className="tnum text-xs text-slate-500">{formatMoney(s.lastPriceCents)}</span>
                      <Badge tone={s.count > 1 ? "warning" : "neutral"}>{s.count}x</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {topServices.some((s) => s.count > 1) ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-800">
                <Battery className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Serviços repetidos podem indicar causa raiz não resolvida (ex.: alternador
                carregando mal queima bateria nova).
              </p>
            ) : null}
          </Card>
        </div>

        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Histórico de manutenção elétrica"
              subtitle={`${orders.length} ordem(ns) de serviço neste veículo`}
              icon={<FileText className="h-4.5 w-4.5" />}
            />

            {orders.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Nenhuma OS para este veículo"
                description="Abra a primeira ordem de serviço para montar o histórico elétrico do veículo."
                action={
                  <Link href={`/os/nova?vehicle=${vehicle.id}`}>
                    <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                      Abrir OS
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {orders.map((o) => (
                  <li
                    key={o.id}
                    className="cursor-pointer rounded-xl border border-line bg-white p-3.5 transition hover:border-brand-300 hover:bg-brand-50/25"
                    onClick={() => router.push(`/os/${o.id}`)}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-bold text-slate-900">{o.number}</span>
                          <StatusBadge status={o.status} />
                          <FinancialBadge status={o.financialStatus} paidCents={o.paidCents} />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatDate(o.entryDate)} · {relativeDay(o.entryDate)}
                          {o.mileageIn ? ` · ${o.mileageIn.toLocaleString("pt-BR")} km` : ""}
                          {o.warrantyMonths > 0 ? ` · garantia ${o.warrantyMonths}m` : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tnum text-base font-bold text-slate-900">
                          {formatMoney(o.totalCents)}
                        </p>
                        <ArrowRight className="ml-auto h-4 w-4 text-slate-300" />
                      </div>
                    </div>

                    {o.reportedIssue ? (
                      <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs leading-relaxed text-slate-700">
                        <strong className="font-semibold text-slate-500">Relato:</strong>{" "}
                        {o.reportedIssue}
                      </p>
                    ) : null}
                    {o.diagnosis ? (
                      <p className="mt-1.5 rounded-lg bg-blue-50/60 px-2.5 py-1.5 text-xs leading-relaxed text-slate-700">
                        <strong className="font-semibold text-blue-600">Diagnóstico:</strong>{" "}
                        {o.diagnosis}
                      </p>
                    ) : null}

                    {o.items.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {o.items.slice(0, 8).map((i, idx) => (
                          <span
                            key={`${i.description}-${idx}`}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                          >
                            <span
                              className={
                                i.kind === "PECA"
                                  ? "h-1.5 w-1.5 rounded-full bg-blue-500"
                                  : "h-1.5 w-1.5 rounded-full bg-brand-500"
                              }
                            />
                            {i.description}
                          </span>
                        ))}
                        {o.items.length > 8 ? (
                          <span className="px-1.5 py-0.5 text-[11px] text-slate-400">
                            +{o.items.length - 8}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
