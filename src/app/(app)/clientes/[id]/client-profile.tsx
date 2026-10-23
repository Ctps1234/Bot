"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Car,
  FileText,
  Gauge,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";
import { Badge, Card, CardHeader, EmptyState, KeyValue, PageHeader, Stat } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { FinancialBadge, PlateTag, StatusBadge } from "@/components/orders/status-badge";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import {
  cn,
  formatDate,
  formatDocument,
  formatMoney,
  formatPhone,
  initials,
  relativeDay,
} from "@/lib/utils";
import {
  PERSON_TYPE_LABEL,
  VOLTAGES,
  type Client,
  type FinancialStatus,
  type OrderStatus,
  type Vehicle,
  type Voltage,
} from "@/lib/types";

export interface ClientOrderRow {
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
  vehiclePlate: string;
  vehicleLabel: string;
  mileageIn: number | null;
}

const EMPTY_VEHICLE = {
  plate: "",
  brand: "",
  model: "",
  year: "",
  color: "",
  voltage: "12V" as Voltage,
  fleetNumber: "",
  notes: "",
};

export function ClientProfile({
  client: initialClient,
  vehicles: initialVehicles,
  orders,
  totals,
}: {
  client: Client;
  vehicles: Vehicle[];
  orders: ClientOrderRow[];
  totals: {
    vehicles: number;
    orders: number;
    revenueCents: number;
    balanceCents: number;
    activeCount: number;
    avgTicketCents: number;
    lastVisit: string | null;
  };
}) {
  const router = useRouter();
  const toast = useToast();

  const [client, setClient] = useState(initialClient);
  const [vehicles, setVehicles] = useState(initialVehicles);

  const [editOpen, setEditOpen] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE);
  const [clientForm, setClientForm] = useState({
    name: initialClient.name,
    personType: initialClient.personType,
    document: initialClient.document ?? "",
    phone: initialClient.phone ?? "",
    email: initialClient.email ?? "",
    address: initialClient.address ?? "",
    notes: initialClient.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [deleteVehicle, setDeleteVehicle] = useState<Vehicle | null>(null);

  async function saveClient(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const { client: updated } = await api.patch<{ client: Client }>(`/api/clients/${client.id}`, {
        name: clientForm.name,
        personType: clientForm.personType,
        document: clientForm.document || null,
        phone: clientForm.phone || null,
        email: clientForm.email || null,
        address: clientForm.address || null,
        notes: clientForm.notes || null,
      });
      setClient(updated);
      setEditOpen(false);
      toast.success("Cliente atualizado");
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível salvar", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveVehicle(event: FormEvent) {
    event.preventDefault();
    if (vehicleForm.plate.trim().length < 4) {
      toast.error("Informe a placa do veículo");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        plate: vehicleForm.plate,
        brand: vehicleForm.brand || null,
        model: vehicleForm.model || null,
        year: vehicleForm.year ? Number(vehicleForm.year) : null,
        color: vehicleForm.color || null,
        voltage: vehicleForm.voltage,
        fleetNumber: vehicleForm.fleetNumber || null,
        notes: vehicleForm.notes || null,
      };
      if (editingVehicle) {
        const { vehicle } = await api.patch<{ vehicle: Vehicle }>(
          `/api/vehicles/${editingVehicle.id}`,
          payload,
        );
        setVehicles((prev) => prev.map((v) => (v.id === vehicle.id ? vehicle : v)));
        toast.success("Veículo atualizado");
      } else {
        const { vehicle } = await api.post<{ vehicle: Vehicle }>(
          `/api/clients/${client.id}/vehicles`,
          payload,
        );
        setVehicles((prev) => [...prev, vehicle].sort((a, b) => a.plate.localeCompare(b.plate)));
        toast.success("Veículo cadastrado", vehicle.plate);
      }
      setVehicleOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível salvar", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeVehicle() {
    if (!deleteVehicle) return;
    setSaving(true);
    try {
      await api.del(`/api/vehicles/${deleteVehicle.id}`);
      setVehicles((prev) => prev.filter((v) => v.id !== deleteVehicle.id));
      setDeleteVehicle(null);
      toast.success("Veículo removido");
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível remover", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-900 text-sm font-bold text-brand-300">
              {initials(client.name)}
            </span>
            <span>{client.name}</span>
            <Badge tone="neutral">{PERSON_TYPE_LABEL[client.personType]}</Badge>
          </span>
        }
        subtitle={
          totals.lastVisit
            ? `Cliente desde ${formatDate(client.createdAt)} · última visita ${relativeDay(totals.lastVisit)}`
            : `Cliente desde ${formatDate(client.createdAt)} · nenhuma OS registrada`
        }
        actions={
          <>
            <Link href="/clientes">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Clientes
              </Button>
            </Link>
            <Button
              icon={<Pencil className="h-4 w-4" />}
              onClick={() => {
                setClientForm({
                  name: client.name,
                  personType: client.personType,
                  document: client.document ?? "",
                  phone: client.phone ?? "",
                  email: client.email ?? "",
                  address: client.address ?? "",
                  notes: client.notes ?? "",
                });
                setEditOpen(true);
              }}
            >
              Editar
            </Button>
            <Link href={`/os/nova?client=${client.id}`}>
              <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                Abrir OS
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Veículos" value={totals.vehicles} icon={<Car className="h-4.5 w-4.5" />} tone="info" />
        <Stat
          label="OS registradas"
          value={totals.orders}
          hint={`${totals.activeCount} em andamento`}
          icon={<FileText className="h-4.5 w-4.5" />}
          tone="brand"
        />
        <Stat
          label="Total consumido"
          value={formatMoney(totals.revenueCents)}
          hint={`Ticket médio ${formatMoney(totals.avgTicketCents)}`}
          icon={<Zap className="h-4.5 w-4.5" />}
        />
        <Stat
          label="Em aberto"
          value={formatMoney(totals.balanceCents)}
          tone={totals.balanceCents > 0 ? "danger" : "success"}
          hint={totals.balanceCents > 0 ? "A receber deste cliente" : "Sem pendências"}
          icon={<Gauge className="h-4.5 w-4.5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* dados do cliente */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Contato" className="mb-3" />
            <dl className="space-y-2.5 text-sm">
              {client.phone ? (
                <div className="flex items-start gap-2">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Telefone
                    </dt>
                    <dd>
                      <a
                        href={`tel:${client.phone.replace(/\D/g, "")}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {formatPhone(client.phone)}
                      </a>
                    </dd>
                  </div>
                </div>
              ) : null}
              {client.email ? (
                <div className="flex items-start gap-2">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      E-mail
                    </dt>
                    <dd className="truncate">{client.email}</dd>
                  </div>
                </div>
              ) : null}
              {client.address ? (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  <div>
                    <dt className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                      Endereço
                    </dt>
                    <dd className="text-slate-700">{client.address}</dd>
                  </div>
                </div>
              ) : null}
              {client.document ? (
                <KeyValue
                  label={client.personType === "JURIDICA" ? "CNPJ" : "CPF"}
                  value={formatDocument(client.document, client.personType)}
                />
              ) : null}
              {client.notes ? (
                <div className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-line ring-inset">
                  <p className="mb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                    Observações
                  </p>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700">
                    {client.notes}
                  </p>
                </div>
              ) : null}
              {!client.phone && !client.email && !client.address && !client.document ? (
                <p className="text-xs text-slate-500">
                  Nenhum dado de contato cadastrado. Clique em <strong>Editar</strong> para
                  completar.
                </p>
              ) : null}
            </dl>
          </Card>

          {/* veículos */}
          <Card padded={false}>
            <div className="p-4">
              <CardHeader
                title="Veículos"
                subtitle={`${vehicles.length} cadastrado(s)`}
                icon={<Car className="h-4.5 w-4.5" />}
                className="mb-3"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setEditingVehicle(null);
                      setVehicleForm(EMPTY_VEHICLE);
                      setVehicleOpen(true);
                    }}
                  >
                    Adicionar
                  </Button>
                }
              />

              {vehicles.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line bg-slate-50/60 px-3 py-5 text-center text-xs text-slate-500">
                  Nenhum veículo cadastrado para este cliente.
                </p>
              ) : (
                <ul className="space-y-2">
                  {vehicles.map((v) => (
                    <li
                      key={v.id}
                      className="group rounded-lg border border-line bg-white p-2.5 transition hover:border-brand-300 hover:bg-brand-50/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/veiculos/${v.id}`} className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <PlateTag plate={v.plate} />
                            <Badge tone="neutral">{v.voltage}</Badge>
                          </div>
                          <p className="mt-1.5 truncate text-sm font-medium text-slate-800">
                            {[v.brand, v.model].filter(Boolean).join(" ") || "Veículo"}
                            {v.year ? ` · ${v.year}` : ""}
                          </p>
                          {v.color || v.fleetNumber ? (
                            <p className="truncate text-[11px] text-slate-500">
                              {[v.color && `cor ${v.color}`, v.fleetNumber && `frota ${v.fleetNumber}`]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          ) : null}
                        </Link>
                        <div className="no-print flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingVehicle(v);
                              setVehicleForm({
                                plate: v.plate,
                                brand: v.brand ?? "",
                                model: v.model ?? "",
                                year: v.year?.toString() ?? "",
                                color: v.color ?? "",
                                voltage: v.voltage,
                                fleetNumber: v.fleetNumber ?? "",
                                notes: v.notes ?? "",
                              });
                              setVehicleOpen(true);
                            }}
                            className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Editar ${v.plate}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteVehicle(v)}
                            className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remover ${v.plate}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        {/* histórico de OS */}
        <Card padded={false}>
          <div className="p-4 sm:p-5">
            <CardHeader
              title="Histórico de serviços"
              subtitle={`${orders.length} ordem(ns) de serviço`}
              icon={<FileText className="h-4.5 w-4.5" />}
            />

            {orders.length === 0 ? (
              <EmptyState
                icon={<FileText className="h-5 w-5" />}
                title="Nenhuma OS para este cliente"
                description="Abra a primeira ordem de serviço para começar o histórico deste cliente."
                action={
                  <Link href={`/os/nova?client=${client.id}`}>
                    <Button variant="primary" icon={<Plus className="h-4 w-4" />}>
                      Abrir OS
                    </Button>
                  </Link>
                }
              />
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5 scrollbar-thin">
                <table className="table-base min-w-[46rem]">
                  <thead>
                    <tr>
                      <th className="w-24">OS</th>
                      <th className="w-36">Veículo</th>
                      <th>Defeito relatado</th>
                      <th className="w-28">Entrada</th>
                      <th className="w-28">Status</th>
                      <th className="w-28">Pagamento</th>
                      <th className="w-24 text-right">Total</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className="cursor-pointer" onClick={() => router.push(`/os/${o.id}`)}>
                        <td className="font-bold text-slate-900">{o.number}</td>
                        <td className="whitespace-nowrap">
                          <PlateTag plate={o.vehiclePlate} />
                          {o.mileageIn ? (
                            <span className="tnum mt-0.5 block text-[11px] text-slate-400">
                              {o.mileageIn.toLocaleString("pt-BR")} km
                            </span>
                          ) : null}
                        </td>
                        <td className="max-w-[18rem]">
                          <span className="line-clamp-2 text-xs text-slate-600">
                            {o.reportedIssue || "—"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-slate-600">{formatDate(o.entryDate)}</td>
                        <td>
                          <StatusBadge status={o.status} />
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* modal editar cliente */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar cliente"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="client-edit-form" variant="primary" loading={saving}>
              Salvar alterações
            </Button>
          </>
        }
      >
        <form id="client-edit-form" onSubmit={saveClient} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
            <Field label="Nome" required>
              <Input
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={clientForm.personType}
                onChange={(e) =>
                  setClientForm({ ...clientForm, personType: e.target.value as never })
                }
              >
                <option value="FISICA">Pessoa física</option>
                <option value="JURIDICA">Pessoa jurídica</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefone / WhatsApp">
              <Input
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
              />
            </Field>
            <Field label={clientForm.personType === "JURIDICA" ? "CNPJ" : "CPF"}>
              <Input
                value={clientForm.document}
                onChange={(e) => setClientForm({ ...clientForm, document: e.target.value })}
              />
            </Field>
          </div>
          <Field label="E-mail">
            <Input
              type="email"
              value={clientForm.email}
              onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
            />
          </Field>
          <Field label="Endereço">
            <Input
              value={clientForm.address}
              onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
            />
          </Field>
          <Field label="Observações">
            <Textarea
              rows={3}
              value={clientForm.notes}
              onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      {/* modal veículo */}
      <Modal
        open={vehicleOpen}
        onClose={() => setVehicleOpen(false)}
        title={editingVehicle ? `Editar veículo ${editingVehicle.plate}` : "Novo veículo"}
        subtitle={client.name}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setVehicleOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="vehicle-form" variant="primary" loading={saving}>
              {editingVehicle ? "Salvar" : "Cadastrar veículo"}
            </Button>
          </>
        }
      >
        <form id="vehicle-form" onSubmit={saveVehicle} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
            <Field label="Placa" required>
              <Input
                autoFocus
                maxLength={8}
                value={vehicleForm.plate}
                onChange={(e) =>
                  setVehicleForm({
                    ...vehicleForm,
                    plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                  })
                }
                className="font-mono font-bold tracking-wider uppercase"
              />
            </Field>
            <Field label="Sistema elétrico" hint="Tensão da bateria">
              <Select
                value={vehicleForm.voltage}
                onChange={(e) => setVehicleForm({ ...vehicleForm, voltage: e.target.value as Voltage })}
              >
                {VOLTAGES.map((v) => (
                  <option key={v} value={v}>
                    {v === "OUTRO" ? "Outro" : v}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Marca">
              <Input
                value={vehicleForm.brand}
                onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })}
                placeholder="Chevrolet"
              />
            </Field>
            <Field label="Modelo">
              <Input
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })}
                placeholder="Onix"
              />
            </Field>
            <Field label="Ano">
              <Input
                type="number"
                min={1950}
                max={2100}
                value={vehicleForm.year}
                onChange={(e) => setVehicleForm({ ...vehicleForm, year: e.target.value })}
                className="tnum"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Cor">
              <Input
                value={vehicleForm.color}
                onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })}
                placeholder="Prata"
              />
            </Field>
            <Field label="Nº de frota" hint="Para clientes com frota">
              <Input
                value={vehicleForm.fleetNumber}
                onChange={(e) => setVehicleForm({ ...vehicleForm, fleetNumber: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Observações do veículo" hint="Histórico elétrico, adaptações, bateria instalada…">
            <Textarea
              rows={3}
              value={vehicleForm.notes}
              onChange={(e) => setVehicleForm({ ...vehicleForm, notes: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteVehicle)}
        onClose={() => setDeleteVehicle(null)}
        onConfirm={removeVehicle}
        loading={saving}
        title={`Remover veículo ${deleteVehicle?.plate}?`}
        confirmLabel="Remover veículo"
        description="Veículos com OS registrada não podem ser removidos."
      />
    </>
  );
}

