"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  Calendar,
  CreditCard,
  Download,
  Hammer,
  Percent,
  PieChart,
  Printer,
  TrendingUp,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { api, errorMessage, qs } from "@/lib/api-client";
import { cn, formatDate, formatMoney, formatShortDate } from "@/lib/utils";
import {
  FIN_LABEL,
  PAYMENT_METHOD_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  type OrderStatus,
  type OrderWithRelations,
} from "@/lib/types";
import type { ReportData } from "@/server/db/stats";



export function ReportsView({
  report,
  presets,
}: {
  report: ReportData;
  presets: Record<string, { from: string; to: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [from, setFrom] = useState(report.period.from);
  const [to, setTo] = useState(report.period.to);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  function apply(key: string) {
    const preset = presets[key];
    if (!preset) return;
    setActivePreset(key);
    setFrom(preset.from);
    setTo(preset.to);
    router.replace(`/relatorios${qs(preset)}`);
  }

  function applyCustom() {
    setActivePreset(null);
    router.replace(`/relatorios${qs({ from, to })}`);
  }

  const [exporting, setExporting] = useState(false);

  /** Escapa um campo para CSV (; como separador, padrão Excel pt-BR). */
  function csvField(value: unknown): string {
    const text = value === null || value === undefined ? "" : String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  /** Centavos -> "1234,56" (vírgula decimal, sem separador de milhar). */
  function csvMoney(cents: number): string {
    return (cents / 100).toFixed(2).replace(".", ",");
  }

  /**
   * Exporta as OS do período — mesmas colunas exibidas na tela.
   * Busca na API porque o relatório traz apenas agregados.
   */
  async function exportCsv() {
    setExporting(true);
    try {
      const data = await api.get<{ rows: OrderWithRelations[] }>(
        `/api/orders${qs({ from, to, limit: 500 })}`,
      );

      if (data.rows.length === 0) {
        toast.info("Nada para exportar", "Nenhuma OS encontrada neste período.");
        return;
      }

      const header = [
        "OS",
        "Cliente",
        "Veículo",
        "Placa",
        "Status",
        "Pagamento",
        "Entrada",
        "Previsão de entrega",
        "Entregue em",
        "KM",
        "Total (R$)",
        "Recebido (R$)",
        "Saldo (R$)",
      ];

      const lines = [header.join(";")];
      for (const o of data.rows) {
        const vehicleName = [o.vehicle.brand, o.vehicle.model].filter(Boolean).join(" ");
        lines.push(
          [
            o.number,
            o.client.name,
            vehicleName,
            o.vehicle.plate,
            STATUS_LABEL[o.status],
            FIN_LABEL[o.financialStatus],
            formatDate(o.entryDate),
            o.expectedFinish ? formatDate(o.expectedFinish) : "",
            o.deliveredAt ? formatDate(o.deliveredAt) : "",
            o.mileageIn ?? "",
            csvMoney(o.totalCents),
            csvMoney(o.paidCents),
            csvMoney(Math.max(0, o.balanceCents)),
          ]
            .map(csvField)
            .join(";"),
        );
      }

      // BOM para o Excel reconhecer UTF-8 (acentos)
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ordens-de-servico_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success("CSV exportado", `${data.rows.length} ordem(ns) de serviço do período.`);
    } catch (error) {
      toast.error("Não foi possível exportar", errorMessage(error));
    } finally {
      setExporting(false);
    }
  }

  const t = report.totals;
  const maxMonth = Math.max(1, ...report.monthly.map((m) => m.revenueCents));
  const partsShare =
    t.partsCents + t.laborCents > 0
      ? Math.round((t.partsCents / (t.partsCents + t.laborCents)) * 100)
      : 0;
  const maxService = Math.max(1, ...report.topServices.map((s) => s.revenueCents));
  const maxMethod = Math.max(1, ...report.byMethod.map((m) => m.totalCents));

  return (
    <>
      <PageHeader
        title="Relatórios"
        subtitle={`${formatShortDate(report.period.from)} até ${formatShortDate(report.period.to)} · ${t.orders} OS no período`}
        actions={
          <>
            <Button
              icon={<Download className="h-4 w-4" />}
              onClick={exportCsv}
              loading={exporting}
              disabled={report.totals.orders === 0}
            >
              {exporting ? "Exportando…" : "Exportar CSV"}
            </Button>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Imprimir
            </Button>
          </>
        }
      />

      {/* filtros de período */}
      <Card className="no-print mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["today", "Hoje"],
                ["last7", "7 dias"],
                ["last30", "30 dias"],
                ["thisMonth", "Este mês"],
                ["lastMonth", "Mês passado"],
                ["year", "Este ano"],
              ] as [string, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => apply(key)}
                className={cn(
                  "rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
                  activePreset === key
                    ? "bg-navy-900 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="De">
              <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            </Field>
            <Field label="Até">
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" />
            </Field>
            <Button variant="primary" icon={<Calendar className="h-4 w-4" />} onClick={applyCustom}>
              Aplicar
            </Button>
          </div>
        </div>
      </Card>

      {t.orders === 0 ? (
        <Card>
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title="Nenhuma OS neste período"
            description="Escolha outro intervalo de datas ou abra novas ordens de serviço para gerar dados."
          />
        </Card>
      ) : (
        <>
          {/* indicadores */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat
              label="Faturamento"
              value={formatMoney(t.revenueCents)}
              hint={`${t.orders} OS · ${t.delivered} entregues`}
              icon={<TrendingUp className="h-4.5 w-4.5" />}
              tone="brand"
            />
            <Stat
              label="Ticket médio"
              value={formatMoney(t.avgTicketCents)}
              hint={`peças ${formatMoney(t.avgPartsCents)} · serviços ${formatMoney(t.avgLaborCents)}`}
              icon={<Percent className="h-4.5 w-4.5" />}
              tone="info"
            />
            <Stat
              label="Recebido"
              value={formatMoney(t.receivedCents)}
              hint={`${t.revenueCents > 0 ? Math.round((t.receivedCents / t.revenueCents) * 100) : 0}% do faturamento`}
              icon={<CreditCard className="h-4.5 w-4.5" />}
              tone="success"
            />
            <Stat
              label="A receber do período"
              value={formatMoney(t.receivableCents)}
              hint={`${t.canceled} OS cancelada(s) no período`}
              icon={<Hammer className="h-4.5 w-4.5" />}
              tone={t.receivableCents > 0 ? "warning" : "neutral"}
            />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* receita por mês */}
            <Card>
              <CardHeader
                title="Receita por mês"
                subtitle="Valores recebidos no período selecionado"
                icon={<BarChart3 className="h-4.5 w-4.5" />}
              />
              <div className="flex h-44 items-end gap-1.5">
                {report.monthly.map((m) => (
                  <div key={m.month} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5">
                    <span className="tnum text-[10px] font-bold text-slate-500 opacity-0 transition group-hover:opacity-100">
                      {m.revenueCents > 0 ? formatMoney(m.revenueCents) : ""}
                    </span>
                    <div
                      className="w-full rounded-t-md bg-brand-400 transition-all group-hover:bg-brand-500"
                      style={{
                        height: `${Math.max(3, (m.revenueCents / maxMonth) * 100)}%`,
                        minHeight: m.revenueCents > 0 ? "4px" : "2px",
                        background: m.revenueCents > 0 ? undefined : "#e2e8f0",
                      }}
                      title={`${m.label}: ${formatMoney(m.revenueCents)} · ${m.orders} OS`}
                    />
                    <span className="truncate text-[10px] font-medium text-slate-500">{m.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* peças x serviços */}
            <Card>
              <CardHeader
                title="Peças × mão de obra"
                subtitle="Composição do faturamento do período"
                icon={<PieChart className="h-4.5 w-4.5" />}
              />
              <div className="flex items-center gap-4">
                <div className="relative h-28 w-28 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.9"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="5"
                      strokeDasharray={`${partsShare} ${100 - partsShare}`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="tnum text-lg font-bold text-slate-900">{partsShare}%</span>
                    <span className="text-[9px] font-semibold tracking-wide text-slate-500 uppercase">
                      peças
                    </span>
                  </div>
                </div>
                <dl className="min-w-0 flex-1 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-brand-500" />
                      Peças
                    </dt>
                    <dd className="tnum text-sm font-bold text-slate-900">{formatMoney(t.partsCents)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-sm text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                      Mão de obra
                    </dt>
                    <dd className="tnum text-sm font-bold text-slate-900">{formatMoney(t.laborCents)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                    <dt className="text-sm font-semibold text-slate-700">Total</dt>
                    <dd className="tnum text-base font-bold text-slate-900">
                      {formatMoney(t.partsCents + t.laborCents)}
                    </dd>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-500">
                    {partsShare > 60
                      ? "Faturamento concentrado em peças — vale revisar a margem de mão de obra."
                      : partsShare < 35
                        ? "Receita puxada por mão de obra — típico de serviços de diagnóstico e reparo elétrico."
                        : "Boa equilíbrio entre peças e mão de obra."}
                  </p>
                </dl>
              </div>
            </Card>

            {/* serviços mais executados */}
            <Card>
              <CardHeader
                title="Serviços mais executados"
                subtitle="Ranking por receita no período"
                icon={<Wrench className="h-4.5 w-4.5" />}
              />
              {report.topServices.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum serviço lançado no período.</p>
              ) : (
                <ul className="space-y-2.5">
                  {report.topServices.map((s, idx) => (
                    <li key={s.description}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-slate-700">
                          <span className="mr-1.5 text-xs font-bold text-slate-400">{idx + 1}.</span>
                          {s.description}
                        </span>
                        <span className="tnum shrink-0 text-sm font-bold text-slate-900">
                          {formatMoney(s.revenueCents)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-brand-400"
                            style={{ width: `${Math.round((s.revenueCents / maxService) * 100)}%` }}
                          />
                        </div>
                        <span className="tnum w-10 text-right text-[11px] text-slate-500">
                          {s.count}x
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* formas de pagamento */}
            <Card>
              <CardHeader
                title="Recebimentos por forma"
                subtitle="Como o cliente pagou no período"
                icon={<CreditCard className="h-4.5 w-4.5" />}
              />
              {report.byMethod.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum pagamento registrado no período.</p>
              ) : (
                <ul className="space-y-2.5">
                  {report.byMethod.map((m) => (
                    <li key={m.method}>
                      <div className="mb-1 flex items-baseline justify-between gap-3">
                        <span className="text-sm text-slate-700">
                          {PAYMENT_METHOD_LABEL[m.method] ?? m.method}
                        </span>
                        <span className="tnum text-sm font-bold text-slate-900">
                          {formatMoney(m.totalCents)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.round((m.totalCents / maxMethod) * 100)}%` }}
                          />
                        </div>
                        <span className="tnum w-10 text-right text-[11px] text-slate-500">
                          {m.count}x
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* status */}
            <Card>
              <CardHeader title="OS por status" icon={<Hammer className="h-4.5 w-4.5" />} className="mb-3" />
              <ul className="space-y-1.5">
                {(["ABERTA", "EM_EXECUCAO", "CONCLUIDA", "ENTREGUE", "CANCELADA"] as OrderStatus[]).map(
                  (status) => {
                    const row = report.byStatus.find((b) => b.status === status);
                    return (
                      <li key={status} className="flex items-center justify-between gap-2">
                        <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
                        <span className="flex items-baseline gap-2">
                          <span className="tnum text-sm font-bold text-slate-900">{row?.count ?? 0}</span>
                          <span className="tnum text-[11px] text-slate-500">
                            {formatMoney(row?.totalCents ?? 0)}
                          </span>
                        </span>
                      </li>
                    );
                  },
                )}
              </ul>
            </Card>

            {/* por técnico */}
            <Card>
              <CardHeader
                title="Produção por responsável"
                subtitle="OS e receita por técnico"
                icon={<UserCog className="h-4.5 w-4.5" />}
                className="mb-3"
              />
              {report.byTechnician.length === 0 ? (
                <p className="text-sm text-slate-500">Sem dados no período.</p>
              ) : (
                <ul className="space-y-2">
                  {report.byTechnician.map((r) => (
                    <li key={r.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-slate-700">{r.name}</span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="tnum text-xs text-slate-500">{r.count} OS</span>
                        <span className="tnum font-bold text-slate-900">
                          {formatMoney(r.revenueCents)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* melhores clientes */}
            <Card>
              <CardHeader
                title="Principais clientes"
                subtitle="Quem mais gerou receita no período"
                icon={<Users className="h-4.5 w-4.5" />}
                className="mb-3"
              />
              {report.topClients.length === 0 ? (
                <p className="text-sm text-slate-500">Sem dados no período.</p>
              ) : (
                <ul className="space-y-2">
                  {report.topClients.map((c, idx) => (
                    <li key={c.name} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate text-slate-700">
                        <span className="mr-1.5 text-xs font-bold text-slate-400">{idx + 1}.</span>
                        {c.name}
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        <span className="tnum text-xs text-slate-500">{c.count} OS</span>
                        <span className="tnum font-bold text-slate-900">
                          {formatMoney(c.revenueCents)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* peças mais usadas */}
          {report.topParts.length > 0 ? (
            <Card className="mt-4" padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader
                  title="Peças mais utilizadas"
                  subtitle="Base para planejar compras e formação de preço"
                  icon={<Hammer className="h-4.5 w-4.5" />}
                  className="mb-3"
                />
                <div className="-mx-4 overflow-x-auto sm:-mx-5 scrollbar-thin">
                  <table className="table-base min-w-[34rem]">
                    <thead>
                      <tr>
                        <th>Peça</th>
                        <th className="w-20 text-center">Uso</th>
                        <th className="w-32 text-right">Receita</th>
                        <th className="w-32 text-right">Preço médio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.topParts.map((p) => (
                        <tr key={p.description}>
                          <td className="font-medium text-slate-800">{p.description}</td>
                          <td className="tnum text-center text-slate-600">{p.count}x</td>
                          <td className="tnum text-right font-semibold text-slate-900">
                            {formatMoney(p.revenueCents)}
                          </td>
                          <td className="tnum text-right text-slate-600">
                            {formatMoney(p.count > 0 ? Math.round(p.revenueCents / p.count) : 0)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </>
  );
}
