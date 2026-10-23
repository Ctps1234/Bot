"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Banknote,
  Car,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Fuel,
  Gauge,
  Pencil,
  PlayCircle,
  Plus,
  Printer,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
  XCircle,
} from "lucide-react";
import { Badge, Card, CardHeader, KeyValue, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ConfirmDialog, Modal } from "@/components/ui/modal";
import { ItemsEditor, itemsTotal, type DraftItem } from "@/components/orders/items-editor";
import { FinancialBadge, PlateTag, StatusBadge } from "@/components/orders/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import {
  addDaysISO,
  cn,
  daysSince,
  formatDate,
  formatDateTime,
  formatDocument,
  formatMoney,
  formatPhone,
  relativeDay,
  toCents,
  todayISO,
  vehicleLabel,
} from "@/lib/utils";
import {
  NEXT_ACTION_LABEL,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  STATUS_FLOW,
  type OrderWithRelations,
  type OrderStatus,
  type PaymentMethod,
} from "@/lib/types";

interface Props {
  order: OrderWithRelations;
  settings: {
    workshopName: string;
    legalName: string;
    document: string;
    phone: string;
    address: string;
    city: string;
    state: string;
    printFooter: string;
    defaultWarrantyMonths: number;
  };
  technicians: { id: number; name: string }[];
  clientVehicles: {
    id: number;
    plate: string;
    brand: string | null;
    model: string | null;
    year: number | null;
    voltage: string;
  }[];
}

export function OrderDetail({ order: initial, settings, technicians, clientVehicles }: Props) {
  const router = useRouter();
  const toast = useToast();

  const [order, setOrder] = useState<OrderWithRelations>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  /* ------------------------------ editar dados ----------------------------- */
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState({
    entryDate: initial.entryDate,
    expectedFinish: initial.expectedFinish ?? "",
    mileageIn: initial.mileageIn?.toString() ?? "",
    fuelLevel: initial.fuelLevel ?? 50,
    technicianId: initial.technicianId ?? "",
    warrantyMonths: initial.warrantyMonths,
    reportedIssue: initial.reportedIssue,
    diagnosis: initial.diagnosis,
    notes: initial.notes,
  });

  /* -------------------------------- itens --------------------------------- */
  const [itemOpen, setItemOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  /* ------------------------------ pagamento ------------------------------- */
  const [payOpen, setPayOpen] = useState(false);
  const [payment, setPayment] = useState<{
    amountCents: number;
    method: PaymentMethod;
    paidAt: string;
    note: string;
  }>({ amountCents: 0, method: "PIX", paidAt: todayISO(), note: "" });

  /* ------------------------------ cancelamento ---------------------------- */
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteItem, setDeleteItem] = useState<{ id: number; description: string } | null>(null);
  const [deletePayment, setDeletePayment] = useState<{ id: number; amountCents: number } | null>(
    null,
  );

  const balance = Math.max(0, order.totalCents - order.paidCents);
  const isCanceled = order.status === "CANCELADA";
  const overdue =
    order.expectedFinish &&
    ["ABERTA", "EM_EXECUCAO"].includes(order.status) &&
    (daysSince(order.expectedFinish) ?? 0) > 0;

  const nextStatuses = useMemo(() => STATUS_FLOW[order.status] ?? [], [order.status]);
  const primaryNext = nextStatuses.find((s) => s !== "CANCELADA");

  async function patch(payload: Record<string, unknown>, message: string) {
    setBusy(message);
    try {
      const { order: updated, warning } = await api.patch<{
        order: OrderWithRelations;
        warning?: string | null;
      }>(`/api/orders/${order.id}`, payload);
      setOrder(updated);
      toast.success(message);
      /*
       * Aviso não bloqueante do servidor — hoje, hodômetro menor que o último
       * registrado para o veículo. Só vem quando KM/veículo foram alterados.
       */
      if (warning) toast.warning("Confira o hodômetro", warning);
      router.refresh();
      return true;
    } catch (err) {
      toast.error("Não foi possível salvar", errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function advance(status: OrderStatus) {
    const ok = await patch({ status }, `OS ${labelFor(status)}`);
    if (ok && status === "ENTREGUE" && order.financialStatus !== "PAGO") {
      toast.info("Pagamento pendente", "Registre o recebimento na aba Financeiro desta OS.");
    }
  }

  function labelFor(status: OrderStatus) {
    const map: Record<OrderStatus, string> = {
      ABERTA: "reaberta",
      EM_EXECUCAO: "em execução",
      CONCLUIDA: "concluída",
      ENTREGUE: "entregue",
      CANCELADA: "cancelada",
    };
    return map[status];
  }

  async function saveEdit() {
    const ok = await patch(
      {
        entryDate: edit.entryDate,
        expectedFinish: edit.expectedFinish || null,
        mileageIn: edit.mileageIn ? Number(edit.mileageIn) : null,
        fuelLevel: edit.fuelLevel,
        technicianId: edit.technicianId ? Number(edit.technicianId) : null,
        warrantyMonths: edit.warrantyMonths,
        reportedIssue: edit.reportedIssue,
        diagnosis: edit.diagnosis,
        notes: edit.notes,
      },
      "Dados da OS atualizados",
    );
    if (ok) setEditOpen(false);
  }

  async function addItems() {
    if (draftItems.length === 0) return;
    setBusy("Adicionando itens");
    try {
      const { order: updated } = await api.post<{ order: OrderWithRelations }>(
        `/api/orders/${order.id}/items`,
        {
          items: draftItems.map((i) => ({
            kind: i.kind,
            description: i.description,
            quantity: i.quantity,
            unitPriceCents: i.unitPriceCents,
            warrantyMonths: i.warrantyMonths,
            notes: i.notes || null,
          })),
        },
      );
      setOrder(updated);
      setDraftItems([]);
      setItemOpen(false);
      toast.success("Itens lançados na OS", `Novo total: ${formatMoney(updated.totalCents)}`);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível lançar os itens", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(id: number) {
    setBusy("Removendo item");
    try {
      const { order: updated } = await api.del<{ order: OrderWithRelations }>(`/api/items/${id}`);
      setOrder(updated);
      setDeleteItem(null);
      toast.success("Item removido");
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível remover", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function submitPayment() {
    if (payment.amountCents <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    setBusy("Registrando pagamento");
    try {
      const { order: updated } = await api.post<{ order: OrderWithRelations }>(
        `/api/orders/${order.id}/payments`,
        {
          amountCents: payment.amountCents,
          method: payment.method,
          paidAt: payment.paidAt,
          note: payment.note || null,
        },
      );
      setOrder(updated);
      setPayOpen(false);
      setPayment({ amountCents: 0, method: "PIX", paidAt: todayISO(), note: "" });
      toast.success(
        "Pagamento registrado",
        updated.financialStatus === "PAGO"
          ? "OS totalmente quitada."
          : `Saldo restante: ${formatMoney(Math.max(0, updated.totalCents - updated.paidCents))}`,
      );
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível registrar o pagamento", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function removePayment(id: number) {
    setBusy("Estornando pagamento");
    try {
      const { order: updated } = await api.del<{ order: OrderWithRelations }>(`/api/payments/${id}`);
      setOrder(updated);
      setDeletePayment(null);
      toast.success("Pagamento estornado");
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível estornar", errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function confirmCancel() {
    const ok = await patch({ status: "CANCELADA", cancelReason }, "OS cancelada");
    if (ok) {
      setCancelOpen(false);
      setCancelReason("");
    }
  }

  const partsTotal = order.items
    .filter((i) => i.kind === "PECA")
    .reduce((s, i) => s + i.totalCents, 0);
  const laborTotal = order.items
    .filter((i) => i.kind === "SERVICO")
    .reduce((s, i) => s + i.totalCents, 0);

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-lg sm:text-xl">{order.number}</span>
            <StatusBadge status={order.status} />
            <FinancialBadge status={order.financialStatus} paidCents={order.paidCents} />
          </span>
        }
        subtitle={`${order.client.name} · ${vehicleLabel(order.vehicle)}`}
        actions={
          <>
            <Link href="/os">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Lista
              </Button>
            </Link>
            <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Imprimir
            </Button>
            <Button
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => {
                setEdit({
                  entryDate: order.entryDate,
                  expectedFinish: order.expectedFinish ?? "",
                  mileageIn: order.mileageIn?.toString() ?? "",
                  fuelLevel: order.fuelLevel ?? 50,
                  technicianId: order.technicianId ?? "",
                  warrantyMonths: order.warrantyMonths,
                  reportedIssue: order.reportedIssue,
                  diagnosis: order.diagnosis,
                  notes: order.notes,
                });
                setEditOpen(true);
              }}
              disabled={isCanceled}
            >
              Editar
            </Button>
            {!isCanceled ? (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setItemOpen(true)}>
                Lançar itens
              </Button>
            ) : null}
          </>
        }
      />

      {isCanceled ? (
        <Card className="mb-4 border-l-4 border-l-red-400 bg-red-50/70">
          <p className="flex items-start gap-2 text-sm text-red-800">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <strong>OS cancelada</strong>
              {order.canceledAt ? ` em ${formatDate(order.canceledAt)}` : ""}. Valores cancelados
              não entram no faturamento nem no financeiro.
            </span>
          </p>
        </Card>
      ) : null}

      {overdue && !isCanceled ? (
        <Card className="mb-4 border-l-4 border-l-amber-400 bg-amber-50/70">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Previsão de entrega vencida ({formatDate(order.expectedFinish)} ·{" "}
            {relativeDay(order.expectedFinish)}). Avise o cliente ou atualize a previsão.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-4">
          {/* resumo do veículo + totais */}
          <Card>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <KeyValue
                  label="Veículo"
                  value={
                    <span className="flex flex-wrap items-center gap-1.5">
                      <PlateTag plate={order.vehicle.plate} />
                      <span className="text-xs text-slate-500">{order.vehicle.voltage}</span>
                    </span>
                  }
                />
                <KeyValue
                  label="Marca/Modelo"
                  value={
                    <span className="text-sm">
                      {[order.vehicle.brand, order.vehicle.model].filter(Boolean).join(" ") || "—"}
                      {order.vehicle.year ? ` · ${order.vehicle.year}` : ""}
                    </span>
                  }
                />
                <KeyValue
                  label="Entrada"
                  value={
                    <span className="text-sm">
                      {formatDate(order.entryDate)}{" "}
                      <span className="text-xs text-slate-400">({relativeDay(order.entryDate)})</span>
                    </span>
                  }
                />
                <KeyValue
                  label="Previsão"
                  value={
                    <span className={cn("text-sm", overdue && "font-semibold text-amber-700")}>
                      {order.expectedFinish ? formatDate(order.expectedFinish) : "—"}
                    </span>
                  }
                />
                <KeyValue
                  label="KM"
                  value={
                    <span className="tnum text-sm">
                      {order.mileageIn ? order.mileageIn.toLocaleString("pt-BR") : "—"}
                    </span>
                  }
                />
                <KeyValue
                  label="Combustível"
                  value={<span className="tnum text-sm">{order.fuelLevel != null ? `${order.fuelLevel}%` : "—"}</span>}
                />
                <KeyValue
                  label="Técnico"
                  value={<span className="text-sm">{order.technician?.name ?? "Não atribuído"}</span>}
                />
                <KeyValue
                  label="Garantia"
                  value={<span className="tnum text-sm">{order.warrantyMonths} meses</span>}
                />
                <KeyValue
                  label="Atualizada"
                  value={<span className="text-sm">{formatDateTime(order.updatedAt)}</span>}
                />
              </dl>

              {/* totais */}
              <div className="min-w-[13rem] rounded-xl bg-navy-900 p-4 text-white">
                <p className="text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
                  Total da OS
                </p>
                <p className="tnum mt-1 text-2xl font-bold text-brand-300">
                  {formatMoney(order.totalCents)}
                </p>

                <dl className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Peças</dt>
                    <dd className="tnum font-medium">{formatMoney(partsTotal)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Mão de obra</dt>
                    <dd className="tnum font-medium">{formatMoney(laborTotal)}</dd>
                  </div>
                  {order.discountCents > 0 ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-400">Desconto</dt>
                      <dd className="tnum font-medium text-red-300">
                        − {formatMoney(order.discountCents)}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3">
                    <dt className="text-slate-400">Recebido</dt>
                    <dd className="tnum font-medium text-emerald-300">{formatMoney(order.paidCents)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-white/10 pt-1.5">
                    <dt className="font-semibold text-white">Saldo</dt>
                    <dd className={cn("tnum font-bold", balance > 0 ? "text-amber-300" : "text-emerald-300")}>
                      {formatMoney(balance)}
                    </dd>
                  </div>
                </dl>

                {!isCanceled ? (
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3 w-full justify-center"
                    icon={<Banknote className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setPayment((p) => ({ ...p, amountCents: balance > 0 ? balance : 0 }));
                      setPayOpen(true);
                    }}
                    disabled={balance <= 0}
                  >
                    {balance > 0 ? "Receber pagamento" : "OS quitada"}
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>

          {/* defeito / diagnóstico */}
          <Card>
            <CardHeader
              title="Defeito relatado e diagnóstico"
              icon={<ClipboardList className="h-4.5 w-4.5" />}
            />
            <div className="space-y-3">
              <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-line ring-inset">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                  Relato do cliente
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                  {order.reportedIssue || "Não informado."}
                </p>
              </div>

              <div className="rounded-lg bg-blue-50/50 p-3 ring-1 ring-blue-100 ring-inset">
                <p className="mb-1 text-[11px] font-bold tracking-wide text-blue-600 uppercase">
                  Diagnóstico técnico
                </p>
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                  {order.diagnosis || "Diagnóstico ainda não registrado."}
                </p>
              </div>

              {order.notes ? (
                <div className="rounded-lg p-3 ring-1 ring-line ring-inset">
                  <p className="mb-1 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
                    Observações
                  </p>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">
                    {order.notes}
                  </p>
                </div>
              ) : null}

              {!isCanceled ? (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setEdit({
                      entryDate: order.entryDate,
                      expectedFinish: order.expectedFinish ?? "",
                      mileageIn: order.mileageIn?.toString() ?? "",
                      fuelLevel: order.fuelLevel ?? 50,
                      technicianId: order.technicianId ?? "",
                      warrantyMonths: order.warrantyMonths,
                      reportedIssue: order.reportedIssue,
                      diagnosis: order.diagnosis,
                      notes: order.notes,
                    });
                    setEditOpen(true);
                  }}
                >
                  Editar relato e diagnóstico
                </Button>
              ) : null}
            </div>
          </Card>

          {/* itens */}
          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader
                title="Peças e serviços"
                subtitle={`${order.items.length} item(ns) lançado(s)`}
                icon={<Wrench className="h-4.5 w-4.5" />}
                action={
                  !isCanceled ? (
                    <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setItemOpen(true)}>
                      Adicionar
                    </Button>
                  ) : null
                }
                className="mb-3"
              />

              {order.items.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-slate-50/60 px-3 py-6 text-center text-sm text-slate-500">
                  Nenhum item lançado. Adicione peças e serviços para compor o valor da OS.
                </p>
              ) : (
                <div className="-mx-4 overflow-x-auto sm:-mx-5 scrollbar-thin">
                  <table className="table-base min-w-[44rem]">
                    <thead>
                      <tr>
                        <th className="w-24">Tipo</th>
                        <th>Descrição</th>
                        <th className="w-16 text-right">Qtd</th>
                        <th className="w-28 text-right">Unitário</th>
                        <th className="w-28 text-right">Total</th>
                        <th className="w-24">Garantia</th>
                        <th className="no-print w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <Badge tone={item.kind === "PECA" ? "info" : "brand"}>
                              {item.kind === "PECA" ? "Peça" : "Serviço"}
                            </Badge>
                          </td>
                          <td>
                            <p className="font-medium text-slate-800">{item.description}</p>
                            {item.notes ? (
                              <p className="mt-0.5 text-xs text-slate-500 italic">{item.notes}</p>
                            ) : null}
                          </td>
                          <td className="tnum text-right">{item.quantity}</td>
                          <td className="tnum text-right">{formatMoney(item.unitPriceCents)}</td>
                          <td className="tnum text-right font-semibold text-slate-900">
                            {formatMoney(item.totalCents)}
                          </td>
                          <td className="text-xs text-slate-600">
                            {item.warrantyMonths > 0 ? `${item.warrantyMonths} meses` : "—"}
                          </td>
                          <td className="no-print">
                            {!isCanceled ? (
                              <button
                                type="button"
                                onClick={() => setDeleteItem({ id: item.id, description: item.description })}
                                className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                aria-label={`Remover ${item.description}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} className="border-t border-line text-right text-xs font-semibold text-slate-500">
                          Subtotal
                        </td>
                        <td className="tnum border-t border-line text-right font-bold text-slate-900">
                          {formatMoney(order.itemsTotalCents)}
                        </td>
                        <td colSpan={2} className="border-t border-line" />
                      </tr>
                      {order.discountCents > 0 ? (
                        <tr>
                          <td colSpan={4} className="text-right text-xs font-semibold text-slate-500">
                            Desconto
                          </td>
                          <td className="tnum text-right font-bold text-red-600">
                            − {formatMoney(order.discountCents)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      ) : null}
                      <tr>
                        <td colSpan={4} className="border-t border-line bg-slate-50/60 text-right text-sm font-bold text-slate-700">
                          Total da OS
                        </td>
                        <td className="tnum border-t border-line bg-slate-50/60 text-right text-base font-bold text-slate-900">
                          {formatMoney(order.totalCents)}
                        </td>
                        <td colSpan={2} className="border-t border-line bg-slate-50/60" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </Card>

          {/* pagamentos */}
          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader
                title="Pagamentos"
                subtitle={`${order.payments.length} lançamento(s) · recebido ${formatMoney(order.paidCents)}`}
                icon={<CreditCard className="h-4.5 w-4.5" />}
                action={
                  !isCanceled ? (
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Banknote className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setPayment((p) => ({ ...p, amountCents: balance > 0 ? balance : 0 }));
                        setPayOpen(true);
                      }}
                    >
                      Receber
                    </Button>
                  ) : null
                }
                className="mb-3"
              />

              {order.payments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-slate-50/60 px-3 py-6 text-center text-sm text-slate-500">
                  Nenhum pagamento registrado.{" "}
                  {balance > 0 ? `Saldo em aberto: ${formatMoney(balance)}.` : ""}
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="table-base">
                    <thead>
                      <tr>
                        <th>Data</th>
                        <th>Forma</th>
                        <th>Observação</th>
                        <th className="text-right">Valor</th>
                        <th className="no-print w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {order.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="whitespace-nowrap text-slate-700">{formatDate(p.paidAt)}</td>
                          <td>
                            <Badge tone="success">{PAYMENT_METHOD_LABEL[p.method]}</Badge>
                          </td>
                          <td className="max-w-[14rem] truncate text-xs text-slate-500">
                            {p.note || "—"}
                          </td>
                          <td className="tnum text-right font-semibold text-emerald-700">
                            {formatMoney(p.amountCents)}
                          </td>
                          <td className="no-print">
                            <button
                              type="button"
                              onClick={() => setDeletePayment({ id: p.id, amountCents: p.amountCents })}
                              className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              aria-label="Estornar pagamento"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* coluna lateral */}
        <div className="space-y-4">
          {/* fluxo */}
          <Card className="no-print">
            <CardHeader title="Andamento" icon={<PlayCircle className="h-4.5 w-4.5" />} className="mb-3" />

            <div className="space-y-1.5">
              {(["ABERTA", "EM_EXECUCAO", "CONCLUIDA", "ENTREGUE"] as OrderStatus[]).map((step) => {
                const stamps: Record<string, string | null> = {
                  ABERTA: order.createdAt,
                  EM_EXECUCAO: null,
                  CONCLUIDA: order.finishedAt,
                  ENTREGUE: order.deliveredAt,
                };
                const current = order.status === step;
                const done =
                  step === "ENTREGUE"
                    ? Boolean(order.deliveredAt)
                    : step === "CONCLUIDA"
                      ? Boolean(order.finishedAt || order.deliveredAt)
                      : step === "EM_EXECUCAO"
                        ? Boolean(order.finishedAt || order.deliveredAt) || current
                        : true;
                const icons: Record<string, typeof FileText> = {
                  ABERTA: FileText,
                  EM_EXECUCAO: Wrench,
                  CONCLUIDA: CheckCircle2,
                  ENTREGUE: Car,
                };
                const Icon = icons[step];
                return (
                  <div
                    key={step}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2",
                      current ? "bg-brand-50 ring-1 ring-brand-200 ring-inset" : "",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        done && !current
                          ? "bg-emerald-100 text-emerald-700"
                          : current
                            ? "bg-brand-500 text-navy-950"
                            : "bg-slate-100 text-slate-400",
                      )}
                    >
                      {done && !current ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-[13px] font-semibold",
                          current ? "text-brand-800" : done ? "text-slate-700" : "text-slate-400",
                        )}
                      >
                        {labelFor(step).replace(/^./, (c) => c.toUpperCase())}
                      </p>
                      <p className="truncate text-[11px] text-slate-400">
                        {stamps[step] ? formatDateTime(stamps[step]) : current ? "etapa atual" : "—"}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {isCanceled ? (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                <XCircle className="h-3.5 w-3.5" /> OS cancelada
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {primaryNext ? (
                  <Button
                    variant="primary"
                    className="w-full justify-center"
                    loading={busy !== null}
                    onClick={() => advance(primaryNext)}
                    iconRight={<ArrowRight className="h-4 w-4" />}
                  >
                    {NEXT_ACTION_LABEL[order.status] ?? `Marcar como ${labelFor(primaryNext)}`}
                  </Button>
                ) : null}

                {nextStatuses.filter((s) => s !== primaryNext).map((s) =>
                  s === "CANCELADA" ? (
                    <Button
                      key={s}
                      variant="ghost"
                      className="w-full justify-center text-red-600 hover:bg-red-50"
                      onClick={() => setCancelOpen(true)}
                      icon={<XCircle className="h-4 w-4" />}
                    >
                      Cancelar OS
                    </Button>
                  ) : (
                    <Button
                      key={s}
                      variant="outline"
                      size="sm"
                      className="w-full justify-center"
                      disabled={busy !== null}
                      onClick={() => advance(s)}
                    >
                      Voltar para {labelFor(s)}
                    </Button>
                  ),
                )}
              </div>
            )}
          </Card>

          {/* cliente */}
          <Card>
            <CardHeader
              title="Cliente"
              icon={<Users className="h-4.5 w-4.5" />}
              className="mb-3"
              action={
                <Link href={`/clientes/${order.client.id}`}>
                  <Button size="sm" variant="ghost" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                    Ficha
                  </Button>
                </Link>
              }
            />
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Nome
                </dt>
                <dd className="font-medium text-slate-900">{order.client.name}</dd>
              </div>
              {order.client.phone ? (
                <div>
                  <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    Telefone
                  </dt>
                  <dd>
                    <a
                      href={`tel:${order.client.phone.replace(/\D/g, "")}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {formatPhone(order.client.phone)}
                    </a>
                  </dd>
                </div>
              ) : null}
              {order.client.document ? (
                <KeyValue
                  label={order.client.personType === "JURIDICA" ? "CNPJ" : "CPF"}
                  value={formatDocument(order.client.document, order.client.personType)}
                />
              ) : null}
              {order.client.email ? <KeyValue label="E-mail" value={order.client.email} /> : null}
              {order.client.address ? <KeyValue label="Endereço" value={order.client.address} /> : null}
            </dl>
          </Card>

          {/* veículo */}
          <Card>
            <CardHeader
              title="Veículo"
              icon={<Car className="h-4.5 w-4.5" />}
              className="mb-3"
              action={
                <Link href={`/veiculos/${order.vehicle.id}`}>
                  <Button size="sm" variant="ghost" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                    Histórico
                  </Button>
                </Link>
              }
            />
            <dl className="space-y-2.5">
              <KeyValue
                label="Placa"
                value={<PlateTag plate={order.vehicle.plate} className="text-xs" />}
              />
              <KeyValue
                label="Marca / Modelo"
                value={
                  <span className="text-sm">
                    {[order.vehicle.brand, order.vehicle.model].filter(Boolean).join(" ") || "—"}
                    {order.vehicle.year ? ` · ${order.vehicle.year}` : ""}
                  </span>
                }
              />
              <KeyValue label="Sistema elétrico" value={<span className="text-sm">{order.vehicle.voltage}</span>} />
              {order.vehicle.color ? <KeyValue label="Cor" value={<span className="text-sm">{order.vehicle.color}</span>} /> : null}
              <div className="flex gap-3">
                <KeyValue
                  className="flex-1"
                  label={<span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> KM</span>}
                  value={
                    <span className="tnum text-sm">
                      {order.mileageIn ? order.mileageIn.toLocaleString("pt-BR") : "—"}
                    </span>
                  }
                />
                <KeyValue
                  className="flex-1"
                  label={<span className="flex items-center gap-1"><Fuel className="h-3 w-3" /> Tanque</span>}
                  value={<span className="tnum text-sm">{order.fuelLevel != null ? `${order.fuelLevel}%` : "—"}</span>}
                />
              </div>
            </dl>

            {clientVehicles.length > 1 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Outros veículos do cliente
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {clientVehicles
                    .filter((v) => v.id !== order.vehicle.id)
                    .map((v) => (
                      <Link key={v.id} href={`/veiculos/${v.id}`}>
                        <PlateTag plate={v.plate} className="transition hover:border-brand-400 hover:bg-brand-50" />
                      </Link>
                    ))}
                </div>
              </div>
            ) : null}
          </Card>

          {/* garantia */}
          <Card className="bg-slate-50/70">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <span>
                Garantia de <strong>{order.warrantyMonths} meses</strong> sobre os serviços desta
                OS
                {order.deliveredAt ? (
                  <>
                    , contados a partir da entrega em{" "}
                    <strong>{formatDate(order.deliveredAt)}</strong>
                    {order.warrantyMonths > 0 ? (
                      <>
                        {" "}
                        (válida até{" "}
                        <strong>
                          {formatDate(addDaysISO(order.warrantyMonths * 30, new Date(order.deliveredAt)))}
                        </strong>
                      </>
                    ) : null}
                  </>
                ) : (
                  ", contados a partir da entrega do veículo"
                )}
                .
              </span>
            </p>
          </Card>
        </div>
      </div>

      {/* ------------------------------ modal editar ----------------------------- */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Editar ${order.number}`}
        subtitle="Dados da entrada, responsável e textos técnicos"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={busy !== null} onClick={saveEdit} icon={<Save className="h-4 w-4" />}>
              Salvar alterações
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Data de entrada" required>
              <Input
                type="date"
                value={edit.entryDate}
                onChange={(e) => setEdit({ ...edit, entryDate: e.target.value })}
              />
            </Field>
            <Field label="Previsão de entrega">
              <Input
                type="date"
                value={edit.expectedFinish}
                onChange={(e) => setEdit({ ...edit, expectedFinish: e.target.value })}
              />
            </Field>
            <Field label="KM de entrada">
              <Input
                type="number"
                min={0}
                value={edit.mileageIn}
                onChange={(e) => setEdit({ ...edit, mileageIn: e.target.value })}
                className="tnum"
              />
            </Field>
            <Field label={`Combustível — ${edit.fuelLevel}%`}>
              <input
                type="range"
                min={0}
                max={100}
                step={12.5}
                value={edit.fuelLevel}
                onChange={(e) => setEdit({ ...edit, fuelLevel: Number(e.target.value) })}
                className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-500"
              />
            </Field>
            <Field label="Técnico responsável">
              <Select
                value={edit.technicianId}
                onChange={(e) =>
                  setEdit({ ...edit, technicianId: e.target.value ? Number(e.target.value) : "" })
                }
                placeholder="Não atribuído"
              >
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Garantia (meses)">
              <Input
                type="number"
                min={0}
                max={120}
                value={edit.warrantyMonths}
                onChange={(e) => setEdit({ ...edit, warrantyMonths: Number(e.target.value) || 0 })}
                className="tnum"
              />
            </Field>
          </div>

          <Field label="Defeito relatado pelo cliente" required>
            <Textarea
              rows={3}
              value={edit.reportedIssue}
              onChange={(e) => setEdit({ ...edit, reportedIssue: e.target.value })}
            />
          </Field>
          <Field label="Diagnóstico técnico" hint="O que foi constatado na avaliação">
            <Textarea
              rows={3}
              value={edit.diagnosis}
              onChange={(e) => setEdit({ ...edit, diagnosis: e.target.value })}
            />
          </Field>
          <Field label="Observações internas">
            <Textarea
              rows={2}
              value={edit.notes}
              onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      {/* ------------------------------ modal itens ------------------------------ */}
      <Modal
        open={itemOpen}
        onClose={() => setItemOpen(false)}
        title={`Lançar peças e serviços — ${order.number}`}
        subtitle="Adicione quantos itens quiser; o total é recalculado automaticamente"
        size="xl"
        footer={
          <>
            <span className="mr-auto text-xs text-slate-500">
              Subtotal a lançar:{" "}
              <strong className="tnum text-slate-900">{formatMoney(itemsTotal(draftItems))}</strong>
              {" · "}novo total da OS:{" "}
              <strong className="tnum text-slate-900">
                {formatMoney(
                  Math.max(0, order.itemsTotalCents + itemsTotal(draftItems) - order.discountCents),
                )}
              </strong>
            </span>
            <Button variant="ghost" onClick={() => setItemOpen(false)}>
              Fechar
            </Button>
            <Button
              variant="primary"
              loading={busy !== null}
              onClick={addItems}
              disabled={draftItems.length === 0}
              icon={<Save className="h-4 w-4" />}
            >
              Lançar {draftItems.length || ""} item(ns)
            </Button>
          </>
        }
      >
        <ItemsEditor
          items={draftItems}
          onChange={setDraftItems}
          defaultWarrantyMonths={order.warrantyMonths || settings.defaultWarrantyMonths}
        />

        {order.items.length > 0 ? (
          <div className="mt-4 border-t border-line pt-3">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
              Já lançado nesta OS
            </p>
            <ul className="space-y-1 text-xs text-slate-600">
              {order.items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3">
                  <span>
                    <Badge tone={i.kind === "PECA" ? "info" : "brand"} className="mr-1.5">
                      {i.kind === "PECA" ? "Peça" : "Serv."}
                    </Badge>
                    {i.description}
                  </span>
                  <span className="tnum font-semibold">{formatMoney(i.totalCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      {/* ---------------------------- modal pagamento ---------------------------- */}
      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={`Receber pagamento — ${order.number}`}
        subtitle={`Saldo em aberto: ${formatMoney(balance)}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="success"
              loading={busy !== null}
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
          {balance > 0 ? (
            <button
              type="button"
              onClick={() => setPayment((p) => ({ ...p, amountCents: balance }))}
              className="flex w-full items-center justify-between rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 transition hover:bg-brand-100"
            >
              <span>Usar saldo total em aberto</span>
              <span className="tnum font-bold">{formatMoney(balance)}</span>
            </button>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Valor (R$)" required>
              <Input
                inputMode="decimal"
                placeholder="0,00"
                prefix={<Banknote className="h-3.5 w-3.5 text-slate-400" />}
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
                placeholder="Ex.: 2x no cartão, pago pelo sócio…"
                value={payment.note}
                onChange={(e) => setPayment({ ...payment, note: e.target.value })}
              />
            </Field>
          </div>

          {payment.amountCents > order.totalCents ? (
            <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              <AlertTriangle className="h-3.5 w-3.5" />
              O valor informado é maior que o total da OS ({formatMoney(order.totalCents)}).
            </p>
          ) : null}
        </div>
      </Modal>

      {/* ---------------------------- modal cancelar ----------------------------- */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={confirmCancel}
        loading={busy !== null}
        title={`Cancelar ${order.number}?`}
        confirmLabel="Cancelar OS"
        description={
          <div className="space-y-2">
            <p>
              A OS será marcada como cancelada e deixará de contar no faturamento e no financeiro.
              Os itens lançados continuam registrados para consulta.
            </p>
            <Input
              placeholder="Motivo do cancelamento (opcional)"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </div>
        }
      />

      <ConfirmDialog
        open={Boolean(deleteItem)}
        onClose={() => setDeleteItem(null)}
        onConfirm={() => deleteItem && removeItem(deleteItem.id)}
        loading={busy !== null}
        title="Remover item da OS?"
        confirmLabel="Remover item"
        description={
          <>
            <strong>{deleteItem?.description}</strong> será removido e o total da OS recalculado.
          </>
        }
      />

      <ConfirmDialog
        open={Boolean(deletePayment)}
        onClose={() => setDeletePayment(null)}
        onConfirm={() => deletePayment && removePayment(deletePayment.id)}
        loading={busy !== null}
        title="Estornar pagamento?"
        confirmLabel="Estornar"
        description={
          <>
            O lançamento de <strong>{formatMoney(deletePayment?.amountCents ?? 0)}</strong> será
            removido e o saldo da OS volta a ficar em aberto.
          </>
        }
      />
    </>
  );
}
