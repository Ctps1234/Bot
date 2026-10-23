"use client";

import { useState } from "react";
import { Plus, Trash2, Wrench, Cog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/card";
import { cn, formatMoney, toCents } from "@/lib/utils";
import { ITEM_KIND_LABEL, type ItemKind } from "@/lib/types";

/** Item ainda não persistido (rascunho enviado junto com a criação da OS). */
export interface DraftItem {
  uid: string;
  kind: ItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  warrantyMonths: number;
  notes?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export function emptyDraft(defaultWarranty = 3): DraftItem {
  return {
    uid: uid(),
    kind: "SERVICO",
    description: "",
    quantity: 1,
    unitPriceCents: 0,
    warrantyMonths: defaultWarranty,
    notes: "",
  };
}

export function itemsTotal(items: DraftItem[]): number {
  return items.reduce(
    (sum, i) => sum + Math.round((i.quantity || 0) * (i.unitPriceCents || 0)),
    0,
  );
}

/**
 * Editor de itens (peças + serviços) usado na criação da OS.
 * Mantém os itens em estado local; o envio acontece junto com o formulário pai.
 */
export function ItemsEditor({
  items,
  onChange,
  defaultWarrantyMonths = 3,
  suggestions,
  disabled,
}: {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
  defaultWarrantyMonths?: number;
  suggestions?: string[];
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<DraftItem>(emptyDraft(defaultWarrantyMonths));
  const [showNotes, setShowNotes] = useState(false);

  function update(patch: Partial<DraftItem>) {
    setDraft((d) => ({ ...d, ...patch }));
  }

  function add() {
    if (!draft.description.trim()) return;
    onChange([...items, { ...draft, uid: uid() }]);
    setDraft(emptyDraft(defaultWarrantyMonths));
    setShowNotes(false);
  }

  function remove(id: string) {
    onChange(items.filter((i) => i.uid !== id));
  }

  function updateItem(id: string, patch: Partial<DraftItem>) {
    onChange(items.map((i) => (i.uid === id ? { ...i, ...patch } : i)));
  }

  const total = itemsTotal(items);
  const parts = items.filter((i) => i.kind === "PECA");
  const services = items.filter((i) => i.kind === "SERVICO");

  return (
    <div>
      {/* lista de itens adicionados */}
      {items.length > 0 ? (
        <div className="mb-3 overflow-hidden rounded-lg border border-line">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-24">Tipo</th>
                <th>Descrição</th>
                <th className="w-20 text-right">Qtd</th>
                <th className="w-28 text-right">Unitário</th>
                <th className="w-28 text-right">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.uid}>
                  <td>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        updateItem(item.uid, {
                          kind: item.kind === "PECA" ? "SERVICO" : "PECA",
                        })
                      }
                      title="Alternar entre peça e serviço"
                    >
                      <Badge tone={item.kind === "PECA" ? "info" : "brand"}>
                        {item.kind === "PECA" ? "Peça" : "Serviço"}
                      </Badge>
                    </button>
                  </td>
                  <td>
                    {disabled ? (
                      <span className="text-slate-800">{item.description}</span>
                    ) : (
                      <input
                        className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-sm text-slate-800 outline-none focus:border-brand-300 focus:bg-white"
                        value={item.description}
                        onChange={(e) => updateItem(item.uid, { description: e.target.value })}
                      />
                    )}
                    {item.notes ? (
                      <p className="mt-0.5 px-1 text-xs text-slate-500 italic">{item.notes}</p>
                    ) : null}
                  </td>
                  <td className="text-right">
                    {disabled ? (
                      <span className="tnum">{item.quantity}</span>
                    ) : (
                      <input
                        type="number"
                        min={0.01}
                        step={0.5}
                        className="tnum w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-sm outline-none focus:border-brand-300 focus:bg-white"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(item.uid, { quantity: Number(e.target.value) || 0 })
                        }
                      />
                    )}
                  </td>
                  <td className="text-right">
                    {disabled ? (
                      <span className="tnum">{formatMoney(item.unitPriceCents)}</span>
                    ) : (
                      <input
                        className="tnum w-24 rounded border border-transparent bg-transparent px-1 py-0.5 text-right text-sm outline-none focus:border-brand-300 focus:bg-white"
                        value={formatMoney(item.unitPriceCents).replace("R$", "").trim()}
                        onChange={(e) =>
                          updateItem(item.uid, { unitPriceCents: toCents(e.target.value) })
                        }
                      />
                    )}
                  </td>
                  <td className="tnum text-right font-semibold text-slate-900">
                    {formatMoney(Math.round(item.quantity * item.unitPriceCents))}
                  </td>
                  <td>
                    {disabled ? null : (
                      <button
                        type="button"
                        onClick={() => remove(item.uid)}
                        className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                        aria-label="Remover item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mb-3 rounded-lg border border-dashed border-line bg-slate-50/60 px-3 py-4 text-center text-xs text-slate-500">
          Nenhum item adicionado. Inclua peças e serviços para compor o valor da OS.
        </p>
      )}

      {/* resumo */}
      {items.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-3 text-xs">
          <span className="text-slate-500">
            {services.length} serviço(s) · {parts.length} peça(s)
          </span>
          <span className="tnum rounded-md bg-slate-900 px-2.5 py-1 text-sm font-bold text-white">
            {formatMoney(total)}
          </span>
        </div>
      ) : null}

      {/* formulário de novo item */}
      {disabled ? null : (
        <div className="rounded-lg border border-line bg-slate-50/60 p-3">
          <p className="mb-2.5 text-xs font-bold tracking-wide text-slate-500 uppercase">
            Adicionar item
          </p>

          <div className="grid gap-2.5 sm:grid-cols-[7rem_1fr]">
            <Field label="Tipo">
              <Select
                value={draft.kind}
                onChange={(e) => update({ kind: e.target.value as ItemKind })}
              >
                {(Object.keys(ITEM_KIND_LABEL) as ItemKind[]).map((k) => (
                  <option key={k} value={k}>
                    {k === "PECA" ? "Peça" : "Serviço"}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Descrição" required>
              <Input
                list="item-suggestions"
                placeholder={
                  draft.kind === "PECA"
                    ? "Ex.: Bateria 60Ah, alternador, motor de partida…"
                    : "Ex.: Troca de bateria, reparo do alternador, diagnóstico de curto…"
                }
                value={draft.description}
                onChange={(e) => update({ description: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              {suggestions && suggestions.length > 0 ? (
                <datalist id="item-suggestions">
                  {suggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              ) : null}
            </Field>
          </div>

          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-4">
            <Field label="Quantidade">
              <Input
                type="number"
                min={0.01}
                step={0.5}
                value={draft.quantity}
                onChange={(e) => update({ quantity: Number(e.target.value) || 0 })}
                className="tnum"
              />
            </Field>
            <Field label="Valor unitário (R$)">
              <Input
                inputMode="decimal"
                placeholder="0,00"
                value={draft.unitPriceCents ? formatMoney(draft.unitPriceCents).replace("R$", "").trim() : ""}
                onChange={(e) => update({ unitPriceCents: toCents(e.target.value) })}
                className="tnum"
              />
            </Field>
            <Field label="Garantia (meses)">
              <Input
                type="number"
                min={0}
                max={120}
                value={draft.warrantyMonths}
                onChange={(e) => update({ warrantyMonths: Number(e.target.value) || 0 })}
                className="tnum"
              />
            </Field>
            <Field label="Total">
              <div
                className={cn(
                  "flex h-9.5 items-center rounded-lg bg-white px-3 text-sm font-bold text-slate-900 ring-1 ring-line ring-inset tnum",
                )}
              >
                {formatMoney(Math.round((draft.quantity || 0) * (draft.unitPriceCents || 0)))}
              </div>
            </Field>
          </div>

          {showNotes ? (
            <Field label="Observação do item" className="mt-2.5">
              <Textarea
                rows={2}
                placeholder="Detalhe técnico, marca da peça, condição encontrada…"
                value={draft.notes ?? ""}
                onChange={(e) => update({ notes: e.target.value })}
              />
            </Field>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={add}
              disabled={!draft.description.trim()}
            >
              Adicionar item
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowNotes((s) => !s)}
              icon={showNotes ? <Cog className="h-3.5 w-3.5" /> : <Wrench className="h-3.5 w-3.5" />}
            >
              {showNotes ? "Ocultar observação" : "Com observação"}
            </Button>
            {items.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => onChange([])}>
                Limpar tudo
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
