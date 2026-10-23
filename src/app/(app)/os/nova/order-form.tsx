"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Car,
  ClipboardList,
  FileText,
  Fuel,
  Gauge,
  Save,
  ShieldCheck,
  UserPlus,
  Users,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, PageHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ItemsEditor, emptyDraft, itemsTotal, type DraftItem } from "@/components/orders/items-editor";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn, formatMoney, onlyDigits, todayISO, addDaysISO, toCents } from "@/lib/utils";
import { VOLTAGES, type Voltage } from "@/lib/types";

export interface ClientOption {
  id: number;
  name: string;
  phone: string | null;
  document: string | null;
}

export interface VehicleOption {
  id: number;
  clientId: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  voltage: Voltage;
}

export function OrderForm({
  clients,
  vehicles,
  technicians,
  defaultWarrantyMonths,
  nextNumber,
  suggestions,
  lastMileage,
}: {
  clients: ClientOption[];
  vehicles: VehicleOption[];
  technicians: { id: number; name: string }[];
  defaultWarrantyMonths: number;
  nextNumber: string;
  suggestions: { description: string; kind: string }[];
  lastMileage: Record<number, number>;
}) {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState<number | "">("");
  const [newClient, setNewClient] = useState({ name: "", phone: "", email: "", document: "" });

  const [vehicleMode, setVehicleMode] = useState<"existing" | "new">("existing");
  const [vehicleId, setVehicleId] = useState<number | "">("");
  const [newVehicle, setNewVehicle] = useState<{
    plate: string;
    brand: string;
    model: string;
    year: string;
    voltage: Voltage;
  }>({ plate: "", brand: "", model: "", year: "", voltage: "12V" });

  const [entryDate, setEntryDate] = useState(todayISO());
  const [expectedFinish, setExpectedFinish] = useState(addDaysISO(1));
  const [mileageIn, setMileageIn] = useState("");
  const [fuelLevel, setFuelLevel] = useState<number>(50);
  const [reportedIssue, setReportedIssue] = useState("");
  const [technicianId, setTechnicianId] = useState<number | "">("");
  const [warrantyMonths, setWarrantyMonths] = useState(defaultWarrantyMonths);
  const [discount, setDiscount] = useState("");
  const [items, setItems] = useState<DraftItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const clientVehicles = useMemo(
    () => (clientId ? vehicles.filter((v) => v.clientId === clientId) : []),
    [clientId, vehicles],
  );

  const selectedVehicle = useMemo(
    () => (vehicleMode === "existing" && vehicleId ? vehicles.find((v) => v.id === vehicleId) : null),
    [vehicleMode, vehicleId, vehicles],
  );

  const itemsCents = itemsTotal(items);
  const discountCents = Math.min(toCents(discount), itemsCents);
  const totalCents = Math.max(0, itemsCents - discountCents);

  function chooseClient(id: number | "") {
    setClientId(id);
    setVehicleId("");
    setVehicleMode("existing");
    if (id) {
      const known = vehicles.find((v) => v.clientId === id);
      if (known) {
        setVehicleId(known.id);
        const km = lastMileage[known.id];
        if (km) setMileageIn(String(km));
      } else {
        setVehicleMode("new");
      }
    }
  }

  function chooseVehicle(id: number | "") {
    setVehicleId(id);
    if (id && lastMileage[id]) setMileageIn(String(lastMileage[id]));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (mode === "existing" && !clientId) next.client = "Selecione o cliente.";
    if (mode === "new" && newClient.name.trim().length < 2)
      next.client = "Informe o nome do cliente.";

    const hasVehicle =
      (vehicleMode === "existing" && vehicleId) ||
      (vehicleMode === "new" && onlyDigits(newVehicle.plate).length >= 4);
    if (!hasVehicle) next.vehicle = "Informe a placa ou selecione um veículo.";

    if (!entryDate) next.entryDate = "Informe a data de entrada.";
    if (items.length === 0) next.items = "Adicione ao menos um item (peça ou serviço).";
    return next;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Verifique os campos destacados", Object.values(found)[0]);
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        entryDate,
        expectedFinish: expectedFinish || null,
        mileageIn: mileageIn ? Number(mileageIn) : null,
        fuelLevel,
        reportedIssue,
        warrantyMonths,
        technicianId: technicianId || null,
        discountCents: discountCents,
        items: items.map((i) => ({
          kind: i.kind,
          description: i.description,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          warrantyMonths: i.warrantyMonths,
          notes: i.notes || null,
        })),
      };

      if (mode === "existing") payload.clientId = clientId;
      else
        payload.client = {
          name: newClient.name,
          phone: newClient.phone || null,
          email: newClient.email || null,
          document: newClient.document || null,
        };

      if (vehicleMode === "existing") payload.vehicleId = vehicleId;
      else
        payload.vehicle = {
          plate: newVehicle.plate,
          brand: newVehicle.brand || null,
          model: newVehicle.model || null,
          year: newVehicle.year ? Number(newVehicle.year) : null,
          voltage: newVehicle.voltage,
        };

      const { order, warning } = await api.post<{
        order: { id: number; number: string };
        warning: string | null;
      }>("/api/orders", payload);

      toast.success(`OS ${order.number} criada`, "Cliente e veículo vinculados com sucesso.");
      // Aviso não bloqueante: a OS foi criada, mas o KM merece conferência.
      if (warning) toast.warning("Confira o hodômetro", warning);
      router.push(`/os/${order.id}`);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível criar a OS", errorMessage(err));
      setSaving(false);
    }
  }

  const suggestionList = Array.from(new Set(suggestions.map((s) => s.description))).slice(0, 40);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            Nova ordem de serviço
            <span className="rounded-md bg-navy-900 px-2 py-0.5 font-mono text-xs font-bold text-brand-300">
              {nextNumber}
            </span>
          </span>
        }
        subtitle="Registre a entrada do veículo, o defeito relatado e os itens do serviço."
        actions={
          <Link href="/os">
            <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
              Voltar para OS
            </Button>
          </Link>
        }
      />

      <form onSubmit={onSubmit} className="space-y-4">
        {/* cliente + veículo */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Cliente"
              icon={<Users className="h-4.5 w-4.5" />}
              action={
                <div className="flex rounded-lg border border-line bg-slate-50 p-0.5">
                  {(["existing", "new"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMode(m)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                        mode === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                      )}
                    >
                      {m === "existing" ? "Cadastrado" : "Novo"}
                    </button>
                  ))}
                </div>
              }
            />

            {mode === "existing" ? (
              <Field
                label="Selecionar cliente"
                required
                error={errors.client}
                hint={clients.length === 0 ? "Nenhum cliente cadastrado — use a aba “Novo”." : undefined}
              >
                <Select
                  value={clientId}
                  onChange={(e) => chooseClient(e.target.value ? Number(e.target.value) : "")}
                  placeholder="Selecione…"
                  invalid={Boolean(errors.client)}
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="space-y-2.5">
                <Field label="Nome" required error={errors.client}>
                  <Input
                    autoFocus
                    placeholder="Nome do cliente"
                    value={newClient.name}
                    onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                    invalid={Boolean(errors.client)}
                  />
                </Field>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field label="Telefone / WhatsApp">
                    <Input
                      placeholder="(21) 99999-9999"
                      inputMode="tel"
                      value={newClient.phone}
                      onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                    />
                  </Field>
                  <Field label="CPF / CNPJ">
                    <Input
                      placeholder="000.000.000-00"
                      value={newClient.document}
                      onChange={(e) => setNewClient({ ...newClient, document: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="E-mail">
                  <Input
                    type="email"
                    placeholder="cliente@email.com"
                    value={newClient.email}
                    onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                  />
                </Field>
                <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  <UserPlus className="h-3.5 w-3.5" />
                  Se o nome já existir no cadastro, a OS será vinculada ao cliente existente.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Veículo"
              icon={<Car className="h-4.5 w-4.5" />}
              action={
                mode === "existing" && clientVehicles.length > 0 ? (
                  <div className="flex rounded-lg border border-line bg-slate-50 p-0.5">
                    {(["existing", "new"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setVehicleMode(m)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                          vehicleMode === m
                            ? "bg-white text-slate-900 shadow-sm"
                            : "text-slate-500 hover:text-slate-700",
                        )}
                      >
                        {m === "existing" ? "Da frota" : "Novo"}
                      </button>
                    ))}
                  </div>
                ) : null
              }
            />

            {vehicleMode === "existing" && clientVehicles.length > 0 ? (
              <Field label="Selecionar veículo" required error={errors.vehicle}>
                <Select
                  value={vehicleId}
                  onChange={(e) => chooseVehicle(e.target.value ? Number(e.target.value) : "")}
                  placeholder="Selecione…"
                  invalid={Boolean(errors.vehicle)}
                >
                  {clientVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plate} · {[v.brand, v.model].filter(Boolean).join(" ") || "veículo"}
                      {v.year ? ` ${v.year}` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <div className="space-y-2.5">
                <div className="grid gap-2.5 sm:grid-cols-[8rem_1fr]">
                  <Field label="Placa" required error={errors.vehicle}>
                    <Input
                      placeholder="ABC1D23"
                      value={newVehicle.plate}
                      maxLength={8}
                      onChange={(e) =>
                        setNewVehicle({
                          ...newVehicle,
                          plate: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
                        })
                      }
                      invalid={Boolean(errors.vehicle)}
                      className="font-mono font-bold tracking-wider uppercase"
                    />
                  </Field>
                  <Field label="Tensão do sistema">
                    <Select
                      value={newVehicle.voltage}
                      onChange={(e) => setNewVehicle({ ...newVehicle, voltage: e.target.value as Voltage })}
                    >
                      {VOLTAGES.map((v) => (
                        <option key={v} value={v}>
                          {v === "OUTRO" ? "Outro" : v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <Field label="Marca">
                    <Input
                      placeholder="Fiat"
                      value={newVehicle.brand}
                      onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                    />
                  </Field>
                  <Field label="Modelo">
                    <Input
                      placeholder="Strada"
                      value={newVehicle.model}
                      onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                    />
                  </Field>
                  <Field label="Ano">
                    <Input
                      type="number"
                      min={1950}
                      max={2100}
                      placeholder="2019"
                      value={newVehicle.year}
                      onChange={(e) => setNewVehicle({ ...newVehicle, year: e.target.value })}
                      className="tnum"
                    />
                  </Field>
                </div>
                {selectedVehicle ? null : (
                  <p className="text-[11px] text-slate-500">
                    O veículo será cadastrado e vinculado a este cliente.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>

        {/* entrada do veículo */}
        <Card>
          <CardHeader
            title="Entrada do veículo"
            subtitle="Dados coletados na recepção"
            icon={<ClipboardList className="h-4.5 w-4.5" />}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Data de entrada" required error={errors.entryDate}>
              <Input
                type="date"
                value={entryDate}
                max={addDaysISO(1)}
                onChange={(e) => setEntryDate(e.target.value)}
                invalid={Boolean(errors.entryDate)}
              />
            </Field>
            <Field label="Previsão de entrega" hint="Deixe vazio se ainda não souber">
              <Input
                type="date"
                value={expectedFinish}
                min={entryDate}
                onChange={(e) => setExpectedFinish(e.target.value)}
              />
            </Field>
            <Field label="KM de entrada">
              <Input
                type="number"
                min={0}
                inputMode="numeric"
                placeholder="0"
                value={mileageIn}
                onChange={(e) => setMileageIn(e.target.value)}
                prefix={<Gauge className="h-3.5 w-3.5 text-slate-400" />}
                className="tnum"
              />
            </Field>
            <Field label="Combustível" hint={`${fuelLevel}% do tanque`}>
              <div className="flex items-center gap-2.5 pt-1.5">
                <Fuel className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={12.5}
                  value={fuelLevel}
                  onChange={(e) => setFuelLevel(Number(e.target.value))}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-500"
                />
                <span className="tnum w-10 text-right text-xs font-bold text-slate-700">
                  {fuelLevel}%
                </span>
              </div>
            </Field>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Técnico responsável">
              <Select
                value={technicianId}
                onChange={(e) => setTechnicianId(e.target.value ? Number(e.target.value) : "")}
                placeholder="Definir depois"
              >
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Garantia do serviço (meses)"
              hint="Aplicada a todos os serviços desta OS"
            >
              <Input
                type="number"
                min={0}
                max={120}
                value={warrantyMonths}
                onChange={(e) => setWarrantyMonths(Number(e.target.value) || 0)}
                prefix={<ShieldCheck className="h-3.5 w-3.5 text-slate-400" />}
                className="tnum"
              />
            </Field>
          </div>

          <Field label="Defeito relatado pelo cliente" className="mt-3" required>
            <Textarea
              rows={3}
              placeholder="Descreva com as palavras do cliente: o que acontece, quando acontece, ruídos, luzes no painel…"
              value={reportedIssue}
              onChange={(e) => setReportedIssue(e.target.value)}
            />
          </Field>
        </Card>

        {/* itens */}
        <Card>
          <CardHeader
            title="Peças e serviços"
            subtitle="Tudo que compõe o valor da ordem de serviço"
            icon={<Wrench className="h-4.5 w-4.5" />}
            action={
              items.length > 0 ? (
                <span className="tnum rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-bold text-white">
                  {formatMoney(totalCents)}
                </span>
              ) : null
            }
          />

          {errors.items ? (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
              {errors.items}
            </p>
          ) : null}

          <ItemsEditor
            items={items}
            onChange={setItems}
            defaultWarrantyMonths={defaultWarrantyMonths}
            suggestions={suggestionList}
          />

          {items.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
              <Field label="Desconto (R$)" className="w-40">
                <Input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="tnum"
                />
              </Field>
              <dl className="space-y-1 text-right">
                <div className="flex items-center justify-end gap-6 text-sm">
                  <dt className="text-slate-500">Subtotal</dt>
                  <dd className="tnum w-28 font-medium text-slate-900">{formatMoney(itemsCents)}</dd>
                </div>
                {discountCents > 0 ? (
                  <div className="flex items-center justify-end gap-6 text-sm">
                    <dt className="text-slate-500">Desconto</dt>
                    <dd className="tnum w-28 font-medium text-red-600">
                      − {formatMoney(discountCents)}
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-end gap-6 border-t border-line pt-1.5">
                  <dt className="text-sm font-semibold text-slate-700">Total da OS</dt>
                  <dd className="tnum w-28 text-lg font-bold text-slate-900">
                    {formatMoney(totalCents)}
                  </dd>
                </div>
              </dl>
            </div>
          ) : null}
        </Card>

        {/* rodapé fixo */}
        <div className="sticky bottom-0 -mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-white/92 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <FileText className="h-4 w-4" />
            A OS será criada com status <strong className="text-slate-700">Aberta</strong>. Você
            avança o fluxo na tela da OS.
          </p>
          <div className="flex items-center gap-2">
            <Link href="/os">
              <Button variant="ghost" disabled={saving}>
                Cancelar
              </Button>
            </Link>
            <Button type="submit" variant="primary" size="lg" loading={saving} icon={<Save className="h-4 w-4" />}>
              {saving ? "Salvando…" : "Criar ordem de serviço"}
            </Button>
          </div>
        </div>
      </form>
    </>
  );
}
