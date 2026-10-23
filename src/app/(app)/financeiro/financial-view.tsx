"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  PiggyBank,
  Wallet,
  X,
} from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, SearchInput, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { FinancialBadge, PlateTag, StatusBadge } from "@/components/orders/status-badge";
import { api, errorMessage, qs } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatMoney, toCents, todayISO } from "@/lib/utils";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type FinancialStatus,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/types";
import type { AgingBucketKey, ReceivablesAging } from "@/server/db/stats";

/**
 * Cores por faixa de atraso: quanto mais antigo o saldo, mais urgente.
 * "Ainda não entregue" fica em azul porque é receita em andamento, não
 * inadimplência.
 */
const AGING_TONE: Record<AgingBucketKey, { box: string; label: string; text: string }> = {
  ATE_7: {
    box: "border-line bg-slate-50",
    label: "text-slate-600",
    text: "text-slate-700",
  },
  DE_8_A_30: {
    box: "border-amber-200 bg-amber-50",
    label: "text-amber-700",
    text: "text-amber-700",
  },
  DE_31_A_60: {
    box: "border-orange-200 bg-orange-50",
    label: "text-orange-700",
    text: "text-orange-700",
  },
  ACIMA_60: {
    box: "border-red-200 bg-red-50",
    label: "text-red-700",
    text: "text-red-700",
  },
  NAO_ENTREGUE: {
    box: "border-sky-200 bg-sky-50",
    label: "text-sky-700",
    text: "text-sky-700",
  },
};

export interface FinancialRow {
  id: number;
  number: string;
  status: OrderStatus;
  entryDate: string;
  deliveredAt: string | null;
  financialStatus: FinancialStatus;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  clientName: string;
  vehiclePlate: string;
  vehicleLabel: string;
}

const FILTERS: { value: FinancialStatus | "TODAS"; label: string }[] = [
  { value: "TODAS", label: "Todas" },
  { value: "PENDENTE", label: "Em aberto" },
  { value: "PARCIAL", label: "Parciais" },
  { value: "PAGO", label: "Quitadas" },
];

export function FinancialView({
  rows: initialRows,
  totals: initialTotals,
  initial,
  period,
  aging,
}: {
  rows: FinancialRow[];
  totals: {
    totalCents: number;
    paidCents: number;
    balanceCents: number;
    orders: number;
    receivedThisMonthCents: number;
  };
  initial: { q: string; fin: string };
  period: { from: string; to: string };
  /** Contas a receber por faixa de atraso — calculado no servidor. */
  aging: ReceivablesAging;
}) {
  const router = useRouter();
  const toast = useToast();

  const [rows, setRows] = useState(initialRows);
  const [totals, setTotals] = useState(initialTotals);
  const [q, setQ] = useState(initial.q);
  const [fin, setFin] = useState<FinancialStatus | "TODAS">(initial.fin as FinancialStatus | "TODAS");
  const [loading, setLoading] = useState(false);

  const [payFor, setPayFor] = useState<FinancialRow | null>(null);
  const [payment, setPayment] = useState<{
    amountCents: number;
    method: PaymentMethod;
    paidAt: string;
    note: string;
  }>({ amountCents: 0, method: "PIX", paidAt: todayISO(), note: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query: string, status: string) => {
    setLoading(true);
    try {
      const data = await api.get<{
        rows: FinancialRow[];
        totals: { totalCents: number; paidCents: number; balanceCents: number; orders: number };
      }>(`/api/stats/financial${qs({ q: query, financialStatus: status, limit: 300 })}`);
      setRows(data.rows);
      setTotals((prev) => ({ ...prev, ...data.totals }));
      window.history.replaceState(null, "", `/financeiro${qs({ q: query, fin: status === "TODAS" ? undefined : status })}`);
    } catch (err) {
      toast.error("Não foi possível carregar", errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const handle = setTimeout(() => load(q, fin), 280);
    return () => clearTimeout(handle);
  }, [q, fin, load]);

  const pending = useMemo(
    () => rows.filter((r) => r.balanceCents > 0),
    [rows],
  );

  function openPayment(row: FinancialRow) {
    setPayFor(row);
    setPayment({
      amountCents: row.balanceCents,
      method: "PIX",
      paidAt: todayISO(),
      note: "",
    });
  }

  async function submitPayment() {
    if (!payFor) return;
    if (payment.amountCents <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/api/orders/${payFor.id}/payments`, {
        amountCents: payment.amountCents,
        method: payment.method,
        paidAt: payment.paidAt,
        note: payment.note || null,
      });
      toast.success(
        `Pagamento registrado na ${payFor.number}`,
        `${formatMoney(payment.amountCents)} via ${PAYMENT_METHOD_LABEL[payment.method]}`,
      );
      setPayFor(null);
      load(q, fin);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível registrar", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Financeiro"
        subtitle={`Recebimentos e pendências por ordem de serviço · ${formatDate(period.from)} – ${formatDate(period.to)}`}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="A receber (total)"
          value={formatMoney(totals.balanceCents)}
          hint={`${pending.length} OS com saldo em aberto`}
          icon={<Wallet className="h-4.5 w-4.5" />}
          tone={totals.balanceCents > 0 ? "danger" : "success"}
        />
        <Stat
          label="Recebido no mês"
          value={formatMoney(totals.receivedThisMonthCents)}
          hint={`${formatDate(period.from)} – ${formatDate(period.to)}`}
          icon={<Banknote className="h-4.5 w-4.5" />}
          tone="success"
        />
        <Stat
          label="Faturado no filtro"
          value={formatMoney(totals.totalCents)}
          hint={`${totals.orders} OS consideradas`}
          icon={<PiggyBank className="h-4.5 w-4.5" />}
          tone="brand"
        />
        <Stat
          label="Já recebido no filtro"
          value={formatMoney(totals.paidCents)}
          hint={
            totals.totalCents > 0
              ? `${Math.round((totals.paidCents / totals.totalCents) * 100)}% do faturado`
              : "—"
          }
          icon={<CheckCircle2 className="h-4.5 w-4.5" />}
          tone="info"
        />
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Contas a receber por atraso"
          subtitle={`${aging.totalOrders} OS com saldo em aberto · ${formatMoney(
            aging.totalCents,
          )} a receber`}
          icon={<Clock className="h-4.5 w-4.5" />}
        />

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {aging.buckets.map((b) => (
            <div key={b.key} className={cn("rounded-lg border p-3", AGING_TONE[b.key].box)}>
              <p
                className={cn(
                  "text-[11px] font-semibold tracking-wide uppercase",
                  AGING_TONE[b.key].label,
                )}
              >
                {b.label}
              </p>
              <p className="tnum mt-1 text-lg font-bold text-slate-900">
                {formatMoney(b.amountCents)}
              </p>
              <p className="text-[11px] text-slate-500">{b.orders} OS</p>
            </div>
          ))}
        </div>

        {aging.rows.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="table-base min-w-[44rem]">
              <thead>
                <tr>
                  <th className="w-24">OS</th>
                  <th>Cliente</th>
                  <th className="w-40">Veículo</th>
                  <th className="w-32">Cobrança desde</th>
                  <th className="w-20 text-right">Dias</th>
                  <th className="w-28 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {aging.rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      className="cursor-pointer font-bold text-slate-900 hover:text-brand-700"
                      onClick={() => router.push(`/os/${r.id}`)}
                    >
                      {r.number}
                    </td>
                    <td className="max-w-[13rem] truncate font-medium text-slate-800">
                      {r.clientName}
                    </td>
                    <td className="whitespace-nowrap">
                      <PlateTag plate={r.vehiclePlate} />
                      {r.vehicleLabel ? (
                        <span className="ml-1.5 text-xs text-slate-500">{r.vehicleLabel}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">
                      {r.anchorDate ? formatDate(r.anchorDate) : "—"}
                    </td>
                    <td className="tnum text-right">
                      {r.bucket === "NAO_ENTREGUE" ? (
                        <span className="text-slate-400">—</span>
                      ) : (
                        <span className={cn("font-semibold", AGING_TONE[r.bucket].text)}>
                          {r.daysOpen}
                        </span>
                      )}
                    </td>
                    <td className="tnum text-right font-bold text-red-600">
                      {formatMoney(r.balanceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="Nada a receber"
            description="Nenhuma ordem de serviço com saldo em aberto no momento."
            icon={<CheckCircle2 className="h-6 w-6" />}
          />
        )}
      </Card>

      <Card className="mt-4" padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-3 sm:p-4">
          <SearchInput
            className="min-w-[14rem] flex-1"
            placeholder="Buscar por nº da OS, cliente ou placa…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="flex items-center gap-1 rounded-lg border border-line bg-slate-50 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFin(f.value)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-semibold transition",
                  fin === f.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          {q || fin !== "TODAS" ? (
            <Button
              size="sm"
              variant="ghost"
              icon={<X className="h-3.5 w-3.5" />}
              onClick={() => {
                setQ("");
                setFin("TODAS");
              }}
            >
              Limpar
            </Button>
          ) : null}
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Wallet className="h-5 w-5" />}
            title="Nenhuma OS neste filtro"
            description="Ajuste a busca ou o filtro de pagamento para ver os valores."
          />
        ) : (
          <div className={cn("overflow-x-auto scrollbar-thin transition-opacity", loading && "opacity-55")}>
            <table className="table-base min-w-[56rem]">
              <thead>
                <tr>
                  <th className="w-24">OS</th>
                  <th>Cliente</th>
                  <th className="w-40">Veículo</th>
                  <th className="w-28">Entrada</th>
                  <th className="w-28">Status</th>
                  <th className="w-28 text-right">Total</th>
                  <th className="w-28 text-right">Recebido</th>
                  <th className="w-28 text-right">Saldo</th>
                  <th className="w-32" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td
                      className="cursor-pointer font-bold text-slate-900 hover:text-brand-700"
                      onClick={() => router.push(`/os/${r.id}`)}
                    >
                      {r.number}
                    </td>
                    <td className="max-w-[13rem] truncate font-medium text-slate-800">
                      {r.clientName}
                    </td>
                    <td className="whitespace-nowrap">
                      <PlateTag plate={r.vehiclePlate} />
                      {r.vehicleLabel ? (
                        <span className="ml-1.5 text-xs text-slate-500">{r.vehicleLabel}</span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{formatDate(r.entryDate)}</td>
                    <td>
                      <div className="flex flex-col items-start gap-1">
                        <StatusBadge status={r.status} />
                        <FinancialBadge status={r.financialStatus} paidCents={r.paidCents} />
                      </div>
                    </td>
                    <td className="tnum text-right font-semibold text-slate-900">
                      {formatMoney(r.totalCents)}
                    </td>
                    <td className="tnum text-right text-emerald-700">
                      {r.paidCents > 0 ? formatMoney(r.paidCents) : "—"}
                    </td>
                    <td className="tnum text-right">
                      {r.balanceCents > 0 ? (
                        <span className="font-bold text-red-600">{formatMoney(r.balanceCents)}</span>
                      ) : (
                        <span className="text-emerald-600">quitado</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        {r.balanceCents > 0 && r.status !== "CANCELADA" ? (
                          <Button size="sm" variant="primary" onClick={() => openPayment(r)}>
                            Receber
                          </Button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => router.push(`/os/${r.id}`)}
                          className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Abrir ${r.number}`}
                        >
                          <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} className="border-t border-line bg-slate-50/70 text-right text-xs font-bold text-slate-600 uppercase">
                    Totais do filtro
                  </td>
                  <td className="tnum border-t border-line bg-slate-50/70 text-right font-bold text-slate-900">
                    {formatMoney(totals.totalCents)}
                  </td>
                  <td className="tnum border-t border-line bg-slate-50/70 text-right font-bold text-emerald-700">
                    {formatMoney(totals.paidCents)}
                  </td>
                  <td className="tnum border-t border-line bg-slate-50/70 text-right font-bold text-red-600">
                    {formatMoney(totals.balanceCents)}
                  </td>
                  <td className="border-t border-line bg-slate-50/70" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {pending.length > 0 ? (
        <p className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          {pending.length} OS com saldo em aberto somando{" "}
          <strong className="tnum text-slate-700">
            {formatMoney(pending.reduce((s, r) => s + r.balanceCents, 0))}
          </strong>
          . Use o botão <strong>Receber</strong> para baixar o pagamento sem sair desta tela.
        </p>
      ) : null}

      <Modal
        open={Boolean(payFor)}
        onClose={() => setPayFor(null)}
        title={`Receber pagamento — ${payFor?.number}`}
        subtitle={
          payFor
            ? `${payFor.clientName} · ${payFor.vehiclePlate} · saldo ${formatMoney(payFor.balanceCents)}`
            : undefined
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayFor(null)}>
              Cancelar
            </Button>
            <Button
              variant="success"
              loading={saving}
              onClick={submitPayment}
              disabled={payment.amountCents <= 0}
              icon={<Banknote className="h-4 w-4" />}
            >
              Registrar {formatMoney(payment.amountCents)}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-line ring-inset">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            {payFor ? (
              <span>
                Total <strong className="tnum">{formatMoney(payFor.totalCents)}</strong> · recebido{" "}
                <strong className="tnum text-emerald-700">{formatMoney(payFor.paidCents)}</strong> ·
                falta <strong className="tnum text-red-600">{formatMoney(payFor.balanceCents)}</strong>
              </span>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor (R$)" required>
              <Input
                autoFocus
                inputMode="decimal"
                placeholder="0,00"
                value={payment.amountCents ? formatMoney(payment.amountCents).replace("R$", "").trim() : ""}
                onChange={(e) => setPayment({ ...payment, amountCents: toCents(e.target.value) })}
                className="tnum"
              />
            </Field>
            <Field label="Forma de pagamento" required>
              <Select
                value={payment.method}
                onChange={(e) => setPayment({ ...payment, method: e.target.value as PaymentMethod })}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Data do recebimento">
              <Input
                type="date"
                value={payment.paidAt}
                max={todayISO()}
                onChange={(e) => setPayment({ ...payment, paidAt: e.target.value })}
              />
            </Field>
            <Field label="Observação">
              <Input
                placeholder="Ex.: pago pelo sócio, 2x no cartão…"
                value={payment.note}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })}
              />
            </Field>
          </div>

          {payFor && payment.amountCents === payFor.balanceCents ? (
            <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Quitando o saldo total desta OS.
            </p>
          ) : null}
        </div>
      </Modal>
    </>
  );
}

