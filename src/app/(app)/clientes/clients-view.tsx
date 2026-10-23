"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Car, Mail, Phone, Plus, Trash2, UserRound, Users } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { api, errorMessage, qs } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatDocument, formatMoney, formatPhone, initials, relativeDay } from "@/lib/utils";
import { PERSON_TYPE_LABEL, type ClientWithStats, type PersonType } from "@/lib/types";

/**
 * Linha da tabela de clientes. É o tipo compartilhado devolvido por
 * `clientsRepo.listWithStats()` — a página e a rota `/api/clients` produzem a
 * mesma forma, então buscar não perde as colunas de agregados.
 */
export type ClientRow = ClientWithStats;

const EMPTY = {
  name: "",
  personType: "FISICA" as PersonType,
  document: "",
  phone: "",
  email: "",
  address: "",
  notes: "",
};

export function ClientsView({
  clients: initialClients,
  total,
  initialQuery,
}: {
  clients: ClientRow[];
  total: number;
  initialQuery: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [rows, setRows] = useState<ClientRow[]>(initialClients);
  const [q, setQ] = useState(initialQuery);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ClientRow | null>(null);

  useEffect(() => {
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api.get<{ rows: ClientRow[]; total: number }>(
          `/api/clients${qs({ q, limit: 300 })}`,
        );
        // enriquece com agregados vindos do servidor na primeira carga
        setRows((prev) =>
          data.rows.map((r) => {
            const old = prev.find((p) => p.id === r.id);
            return old ? { ...old, ...r } : r;
          }),
        );
        window.history.replaceState(null, "", `/clientes${qs({ q })}`);
      } finally {
        setLoading(false);
      }
    }, 280);
    return () => clearTimeout(handle);
  }, [q]);

  function openNew() {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  }

  function openEdit(client: ClientRow) {
    setEditing(client);
    setForm({
      name: client.name,
      personType: client.personType,
      document: client.document ?? "",
      phone: client.phone ?? "",
      email: client.email ?? "",
      address: client.address ?? "",
      notes: client.notes ?? "",
    });
    setModalOpen(true);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      toast.error("Informe o nome do cliente");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        personType: form.personType,
        document: form.document || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        notes: form.notes || null,
      };
      if (editing) {
        await api.patch(`/api/clients/${editing.id}`, payload);
        toast.success("Cliente atualizado");
      } else {
        await api.post("/api/clients", payload);
        toast.success("Cliente cadastrado", form.name);
      }
      setModalOpen(false);
      router.refresh();
      const data = await api.get<{ rows: ClientRow[] }>(`/api/clients${qs({ q, limit: 300 })}`);
      setRows((prev) =>
        data.rows.map((r) => {
          const old = prev.find((p) => p.id === r.id);
          return old ? { ...old, ...r } : { ...r, vehicles: 0, orders: 0, lastVisit: null, balanceCents: 0 };
        }),
      );
    } catch (err) {
      toast.error("Não foi possível salvar", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return;
    setSaving(true);
    try {
      await api.del(`/api/clients/${confirmDelete.id}`);
      setRows((prev) => prev.filter((c) => c.id !== confirmDelete.id));
      toast.success("Cliente excluído");
      setConfirmDelete(null);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível excluir", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${total} cliente(s) cadastrado(s)`}
        actions={
          <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
            Novo cliente
          </Button>
        }
      />

      <Card padded={false}>
        <div className="border-b border-line p-3 sm:p-4">
          <SearchInput
            placeholder="Buscar por nome, telefone, e-mail ou CPF/CNPJ…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title={q ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            description={
              q
                ? "Tente outro nome, telefone ou documento."
                : "Cadastre o primeiro cliente para abrir ordens de serviço."
            }
            action={
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                Novo cliente
              </Button>
            }
          />
        ) : (
          <div className={cn("overflow-x-auto scrollbar-thin transition-opacity", loading && "opacity-55")}>
            <table className="table-base min-w-[52rem]">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="w-40">Contato</th>
                  <th className="w-40">Documento</th>
                  <th className="w-20 text-center">Veículos</th>
                  <th className="w-20 text-center">OS</th>
                  <th className="w-32">Última visita</th>
                  <th className="w-28 text-right">Em aberto</th>
                  <th className="no-print w-20" />
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="cursor-pointer" onClick={() => router.push(`/clientes/${c.id}`)}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-brand-300">
                          {initials(c.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{c.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {PERSON_TYPE_LABEL[c.personType]}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap">
                      {c.phone ? (
                        <span className="flex items-center gap-1.5 text-slate-700">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {formatPhone(c.phone)}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {c.email ? (
                        <span className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-500">
                          <Mail className="h-3 w-3 shrink-0" />
                          {c.email}
                        </span>
                      ) : null}
                    </td>
                    <td className="tnum text-slate-600">
                      {c.document ? formatDocument(c.document, c.personType) : "—"}
                    </td>
                    <td className="text-center">
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Car className="h-3.5 w-3.5 text-slate-400" />
                        <span className="tnum font-semibold">{c.vehicles}</span>
                      </span>
                    </td>
                    <td className="tnum text-center font-semibold text-slate-700">{c.orders}</td>
                    <td className="whitespace-nowrap text-slate-600">
                      {c.lastVisit ? (
                        <>
                          {formatDate(c.lastVisit)}
                          <span className="ml-1 text-[11px] text-slate-400">
                            ({relativeDay(c.lastVisit)})
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">nunca</span>
                      )}
                    </td>
                    <td className="tnum text-right">
                      {c.balanceCents > 0 ? (
                        <span className="font-semibold text-red-600">{formatMoney(c.balanceCents)}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="no-print">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(c);
                          }}
                          className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                          aria-label={`Editar ${c.name}`}
                        >
                          <UserRound className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(c);
                          }}
                          className="rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Excluir ${c.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        <ArrowRight className="h-4 w-4 text-slate-300" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* cadastro / edição */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${editing.name}` : "Novo cliente"}
        subtitle="Dados de contato usados na OS e no envio de orçamentos"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="client-form" variant="primary" loading={saving}>
              {editing ? "Salvar alterações" : "Cadastrar cliente"}
            </Button>
          </>
        }
      >
        <form id="client-form" onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
            <Field label="Nome" required>
              <Input
                autoFocus
                placeholder="Nome do cliente ou razão social"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>
            <Field label="Tipo">
              <Select
                value={form.personType}
                onChange={(e) => setForm({ ...form, personType: e.target.value as PersonType })}
              >
                <option value="FISICA">Pessoa física</option>
                <option value="JURIDICA">Pessoa jurídica</option>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Telefone / WhatsApp">
              <Input
                placeholder="(21) 99999-9999"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label={form.personType === "JURIDICA" ? "CNPJ" : "CPF"}>
              <Input
                placeholder={form.personType === "JURIDICA" ? "00.000.000/0001-00" : "000.000.000-00"}
                value={form.document}
                onChange={(e) => setForm({ ...form, document: e.target.value })}
              />
            </Field>
          </div>

          <Field label="E-mail">
            <Input
              type="email"
              placeholder="cliente@email.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>

          <Field label="Endereço">
            <Input
              placeholder="Rua, número, bairro, cidade"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>

          <Field label="Observações" hint="Preferências, histórico, frota, convênio…">
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={remove}
        loading={saving}
        title={`Excluir ${confirmDelete?.name}?`}
        confirmLabel="Excluir cliente"
        description={
          <>
            Clientes com ordem de serviço registrada não podem ser excluídos — nesse caso, apenas
            edite os dados.
          </>
        }
      />

      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <Badge tone="info">Dica</Badge>
        Ao abrir uma OS você também pode cadastrar o cliente na hora — ele entra nesta lista
        automaticamente.
      </div>
    </>
  );
}

