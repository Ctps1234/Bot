"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  Building2,
  Database,
  KeyRound,
  Plus,
  Printer,
  Save,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
import { Badge, Card, CardHeader, KeyValue, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Modal, ConfirmDialog } from "@/components/ui/modal";
import { api, errorMessage } from "@/lib/api-client";
import { useToast } from "@/components/ui/toast";
import { cn, formatDate, formatMoney, initials, toCents } from "@/lib/utils";
import { ROLE_LABEL, ROLES, type Role, type WorkshopSettings } from "@/lib/types";

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  active: boolean;
  createdAt: string;
}

const EMPTY_USER = { name: "", email: "", password: "", role: "TECNICO" as Role, phone: "" };

export function SettingsView({
  settings: initialSettings,
  users: initialUsers,
  currentUserId,
  canManageUsers,
  canEditSettings,
  driver,
}: {
  settings: WorkshopSettings;
  users: UserRow[];
  currentUserId: number;
  canManageUsers: boolean;
  canEditSettings: boolean;
  driver: string;
}) {
  const router = useRouter();
  const toast = useToast();

  const [settings, setSettings] = useState(initialSettings);
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [form, setForm] = useState({
    workshopName: initialSettings.workshopName,
    legalName: initialSettings.legalName,
    document: initialSettings.document,
    phone: initialSettings.phone,
    address: initialSettings.address,
    city: initialSettings.city,
    state: initialSettings.state,
    defaultWarrantyMonths: initialSettings.defaultWarrantyMonths,
    defaultLaborHour: initialSettings.defaultLaborHourCents
      ? formatMoney(initialSettings.defaultLaborHourCents).replace("R$", "").trim()
      : "",
    printFooter: initialSettings.printFooter,
  });
  const [saving, setSaving] = useState(false);

  const [userOpen, setUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [toggleUser, setToggleUser] = useState<UserRow | null>(null);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    if (!canEditSettings) {
      toast.error("Sem permissão", "Somente administrador ou gestor altera as configurações.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        workshopName: form.workshopName,
        legalName: form.legalName,
        document: form.document,
        phone: form.phone,
        address: form.address,
        city: form.city,
        state: form.state.toUpperCase().slice(0, 2),
        defaultWarrantyMonths: form.defaultWarrantyMonths,
        defaultLaborHourCents: toCents(form.defaultLaborHour),
        printFooter: form.printFooter,
      };
      const { settings: updated } = await api.patch<{ settings: WorkshopSettings }>(
        "/api/settings",
        payload,
      );
      setSettings(updated);
      toast.success("Configurações salvas");
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível salvar", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        const { user } = await api.patch<{ user: UserRow }>("/api/users", {
          id: editingUser.id,
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          phone: userForm.phone || null,
          ...(userForm.password ? { password: userForm.password } : {}),
        });
        setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...user } : u)));
        toast.success("Usuário atualizado");
      } else {
        const { user } = await api.post<{ user: UserRow }>("/api/users", {
          name: userForm.name,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role,
          phone: userForm.phone || null,
        });
        setUsers((prev) => [...prev, { ...user, createdAt: new Date().toISOString() }]);
        toast.success("Usuário criado", user.email);
      }
      setUserOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível salvar o usuário", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function confirmToggleUser() {
    if (!toggleUser) return;
    setSaving(true);
    try {
      const { user } = await api.patch<{ user: UserRow }>("/api/users", {
        id: toggleUser.id,
        active: !toggleUser.active,
      });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, ...user } : u)));
      toast.success(user.active ? "Usuário reativado" : "Usuário desativado");
      setToggleUser(null);
      router.refresh();
    } catch (err) {
      toast.error("Não foi possível alterar", errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Dados da oficina usados nas telas e na OS impressa, além dos usuários do sistema"
      />

      {!canEditSettings ? (
        <Card className="mb-4 border-l-4 border-l-amber-400 bg-amber-50/60">
          <p className="flex items-start gap-2 text-sm text-amber-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            Seu perfil é <strong>{ROLE_LABEL[users.find((u) => u.id === currentUserId)?.role ?? "RECEPCAO"]}</strong>:
            você pode consultar, mas não alterar os dados da oficina.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Dados da oficina"
            subtitle="Aparecem no cabeçalho e rodapé da OS impressa"
            icon={<Building2 className="h-4.5 w-4.5" />}
          />
          <form id="settings-form" onSubmit={saveSettings} className="space-y-3">
            <Field label="Nome da oficina" required>
              <Input
                value={form.workshopName}
                disabled={!canEditSettings}
                onChange={(e) => setForm({ ...form, workshopName: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Razão social">
                <Input
                  value={form.legalName}
                  disabled={!canEditSettings}
                  placeholder="Ex.: Auto Elétrica Silva LTDA"
                  onChange={(e) => setForm({ ...form, legalName: e.target.value })}
                />
              </Field>
              <Field label="CNPJ">
                <Input
                  value={form.document}
                  disabled={!canEditSettings}
                  placeholder="00.000.000/0001-00"
                  onChange={(e) => setForm({ ...form, document: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Telefone">
              <Input
                value={form.phone}
                disabled={!canEditSettings}
                placeholder="(21) 3333-4444"
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
            <Field label="Endereço">
              <Input
                value={form.address}
                disabled={!canEditSettings}
                placeholder="Rua, número, bairro"
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[1fr_5rem]">
              <Field label="Cidade">
                <Input
                  value={form.city}
                  disabled={!canEditSettings}
                  placeholder="Rio de Janeiro"
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
              <Field label="UF">
                <Input
                  value={form.state}
                  disabled={!canEditSettings}
                  maxLength={2}
                  placeholder="RJ"
                  onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                  className="font-bold uppercase"
                />
              </Field>
            </div>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Padrões de serviço"
              subtitle="Aplicados automaticamente em novas OS"
              icon={<Wrench className="h-4.5 w-4.5" />}
            />
            <form onSubmit={saveSettings} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Garantia padrão (meses)"
                  hint="Usada em novas ordens de serviço"
                >
                  <Input
                    type="number"
                    min={0}
                    max={120}
                    value={form.defaultWarrantyMonths}
                    disabled={!canEditSettings}
                    onChange={(e) =>
                      setForm({ ...form, defaultWarrantyMonths: Number(e.target.value) || 0 })
                    }
                    className="tnum"
                  />
                </Field>
                <Field
                  label="Hora de mão de obra (R$)"
                  hint="Referência para orçar serviços"
                >
                  <Input
                    inputMode="decimal"
                    placeholder="0,00"
                    value={form.defaultLaborHour}
                    disabled={!canEditSettings}
                    onChange={(e) => setForm({ ...form, defaultLaborHour: e.target.value })}
                    className="tnum"
                  />
                </Field>
              </div>

              <Field label="Mensagem no rodapé da OS impressa" hint="Condições de garantia, aviso de retirada, etc.">
                <Textarea
                  rows={3}
                  value={form.printFooter}
                  disabled={!canEditSettings}
                  onChange={(e) => setForm({ ...form, printFooter: e.target.value })}
                />
              </Field>

              <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-line ring-inset">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-700">Próxima OS</p>
                  <p className="tnum font-mono text-sm font-bold text-slate-900">
                    OS-{String(settings.orderSeq + 1).padStart(4, "0")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">OS emitidas</p>
                  <p className="tnum text-sm font-bold text-slate-900">{settings.orderSeq}</p>
                </div>
              </div>

              {canEditSettings ? (
                <Button type="submit" variant="primary" loading={saving} icon={<Save className="h-4 w-4" />}>
                  Salvar configurações
                </Button>
              ) : null}
            </form>
          </Card>

          <Card>
            <CardHeader title="Sistema" icon={<Database className="h-4.5 w-4.5" />} className="mb-3" />
            <dl className="grid grid-cols-2 gap-3">
              <KeyValue label="Banco de dados" value={<span className="font-mono text-xs">{driver}</span>} />
              <KeyValue label="Armazenamento" value={<span className="text-xs">SQLite local (data/)</span>} />
              <KeyValue label="Usuários" value={<span className="tnum text-xs">{users.length}</span>} />
              <KeyValue
                label="Sessão"
                value={<span className="text-xs">Cookie assinado · 7 dias</span>}
              />
            </dl>
            <p className="mt-3 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
              <Printer className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              A OS tem layout de impressão próprio: abra uma OS e clique em{" "}
              <strong>Imprimir</strong> (o menu e os botões saem automaticamente da página).
            </p>
          </Card>
        </div>
      </div>

      {/* usuários */}
      <Card className="mt-4" padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Usuários e permissões"
            subtitle="Quem acessa o sistema e o que pode fazer"
            icon={<Users className="h-4.5 w-4.5" />}
            action={
              canManageUsers ? (
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setEditingUser(null);
                    setUserForm(EMPTY_USER);
                    setUserOpen(true);
                  }}
                >
                  Novo usuário
                </Button>
              ) : null
            }
            className="mb-3"
          />

          <div className="-mx-4 overflow-x-auto sm:-mx-5 scrollbar-thin">
            <table className="table-base min-w-[44rem]">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th className="w-52">E-mail</th>
                  <th className="w-36">Perfil</th>
                  <th className="w-32">Criado em</th>
                  <th className="w-24">Situação</th>
                  <th className="no-print w-32" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                            u.active ? "bg-navy-900 text-brand-300" : "bg-slate-200 text-slate-500",
                          )}
                        >
                          {initials(u.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {u.name}
                            {u.id === currentUserId ? (
                              <span className="ml-1.5 text-[11px] font-medium text-brand-600">(você)</span>
                            ) : null}
                          </p>
                          {u.phone ? <p className="text-[11px] text-slate-500">{u.phone}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="truncate text-slate-600">{u.email}</td>
                    <td>
                      <Badge tone={u.role === "ADMIN" ? "brand" : u.role === "GESTOR" ? "info" : "neutral"}>
                        {ROLE_LABEL[u.role]}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap text-slate-600">{formatDate(u.createdAt)}</td>
                    <td>
                      <Badge tone={u.active ? "success" : "danger"} dot>
                        {u.active ? "Ativo" : "Inativo"}
                      </Badge>
                    </td>
                    <td className="no-print">
                      {canManageUsers ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUser(u);
                              setUserForm({
                                name: u.name,
                                email: u.email,
                                password: "",
                                role: u.role,
                                phone: u.phone ?? "",
                              });
                              setUserOpen(true);
                            }}
                            className="rounded p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            aria-label={`Editar ${u.name}`}
                          >
                            <UserCog className="h-4 w-4" />
                          </button>
                          {u.id !== currentUserId ? (
                            <button
                              type="button"
                              onClick={() => setToggleUser(u)}
                              className="rounded p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-700"
                              aria-label={u.active ? `Desativar ${u.name}` : `Reativar ${u.name}`}
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {ROLES.map((role) => {
              const permissions: Record<Role, string> = {
                ADMIN: "Tudo, inclusive usuários e exclusões definitivas.",
                GESTOR: "OS, clientes, financeiro, relatórios e configurações.",
                TECNICO: "OS e diagnóstico; sem financeiro nem configurações.",
                RECEPCAO: "Abertura de OS e cadastro de clientes.",
              };
              return (
                <div key={role} className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-line ring-inset">
                  <p className="text-xs font-bold text-slate-800">{ROLE_LABEL[role]}</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                    {permissions[role]}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* modal usuário */}
      <Modal
        open={userOpen}
        onClose={() => setUserOpen(false)}
        title={editingUser ? `Editar ${editingUser.name}` : "Novo usuário"}
        subtitle="O usuário entra com e-mail e senha"
        footer={
          <>
            <Button variant="ghost" onClick={() => setUserOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="user-form" variant="primary" loading={saving}>
              {editingUser ? "Salvar" : "Criar usuário"}
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={saveUser} className="space-y-3">
          <Field label="Nome" required>
            <Input
              autoFocus
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              placeholder="Nome do colaborador"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="E-mail" required>
              <Input
                type="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                placeholder="nome@oficina.com"
              />
            </Field>
            <Field label="Telefone">
              <Input
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                placeholder="(21) 99999-9999"
              />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Perfil" required>
              <Select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={editingUser ? "Nova senha" : "Senha"}
              required={!editingUser}
              hint={editingUser ? "Deixe em branco para manter a atual" : "mínimo 6 caracteres"}
            >
              <Input
                type="password"
                autoComplete="new-password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="••••••"
              />
            </Field>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(toggleUser)}
        onClose={() => setToggleUser(null)}
        onConfirm={confirmToggleUser}
        loading={saving}
        tone={toggleUser?.active ? "danger" : "primary"}
        title={toggleUser?.active ? `Desativar ${toggleUser?.name}?` : `Reativar ${toggleUser?.name}?`}
        confirmLabel={toggleUser?.active ? "Desativar acesso" : "Reativar acesso"}
        description={
          toggleUser?.active
            ? "O usuário não conseguirá mais entrar no sistema, mas o histórico de OS permanece intacto."
            : "O usuário voltará a acessar o sistema com a mesma senha."
        }
      />
    </>
  );
}
