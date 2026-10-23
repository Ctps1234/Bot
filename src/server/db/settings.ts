import { getDb } from "./index";
import { nowISO } from "./mappers";
import type { WorkshopSettings } from "@/lib/types";

const DEFAULTS: WorkshopSettings = {
  workshopName: "Minha Oficina Elétrica",
  legalName: "",
  document: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  defaultWarrantyMonths: 3,
  defaultLaborHourCents: 0,
  orderSeq: 0,
  printFooter:
    "Serviços elétricos com garantia. Guarde esta ordem de serviço para acionar a garantia.",
};

/**
 * Valores de identidade gravados pelo seed como exemplo.
 *
 * Ficam aqui (e não duplicados no seed) para que a detecção de "configuração
 * pendente" e a carga inicial nunca divirjam.
 */
export const SAMPLE_IDENTITY = {
  workshopName: "Auto Elétrica Andrade",
  legalName: "Auto Elétrica Andrade ME",
  document: "34.567.890/0001-12",
  phone: "(21) 3322-4455",
  address: "Rua Visconde de Santa Isabel, 340 — Vila Isabel",
  city: "Rio de Janeiro",
  state: "RJ",
} as const;

const KEY_MAP: Record<string, keyof WorkshopSettings> = {
  workshop_name: "workshopName",
  legal_name: "legalName",
  document: "document",
  phone: "phone",
  address: "address",
  city: "city",
  state: "state",
  default_warranty_months: "defaultWarrantyMonths",
  default_labor_hour_cents: "defaultLaborHourCents",
  order_seq: "orderSeq",
  print_footer: "printFooter",
};

const REVERSE_MAP: Record<keyof WorkshopSettings, string> = Object.fromEntries(
  Object.entries(KEY_MAP).map(([k, v]) => [v, k]),
) as Record<keyof WorkshopSettings, string>;

function cast(key: keyof WorkshopSettings, value: string | null): string | number {
  if (value === null) return DEFAULTS[key];
  if (
    key === "defaultWarrantyMonths" ||
    key === "defaultLaborHourCents" ||
    key === "orderSeq"
  ) {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) ? n : DEFAULTS[key];
  }
  return value;
}

export const settingsRepo = {
  all(): WorkshopSettings {
    const rows = getDb().prepare("SELECT key, value FROM settings").all();
    const out = { ...DEFAULTS };
    for (const row of rows) {
      const field = KEY_MAP[String(row.key)];
      if (!field) continue;
      (out as unknown as Record<string, unknown>)[field] = cast(
        field,
        row.value === null ? null : String(row.value),
      );
    }
    return out;
  },

  get<K extends keyof WorkshopSettings>(key: K): WorkshopSettings[K] {
    return this.all()[key];
  },

  set(key: keyof WorkshopSettings, value: string | number): void {
    const dbKey = REVERSE_MAP[key];
    if (!dbKey) return;
    getDb()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(dbKey, String(value), nowISO());
  },

  update(patch: Partial<WorkshopSettings>): WorkshopSettings {
    const db = getDb();
    db.transaction(() => {
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        this.set(key as keyof WorkshopSettings, value as string | number);
      }
    });
    return this.all();
  },

  /** Próximo número sequencial de OS (incrementa atomicamente). */
  nextOrderNumber(): { seq: number; number: string } {
    const db = getDb();
    let seq = 0;
    db.transaction(() => {
      const current = Number.parseInt(this.rawGet("order_seq") ?? "0", 10);
      seq = (Number.isFinite(current) ? current : 0) + 1;
      this.set("orderSeq", seq);
    });
    return { seq, number: `OS-${String(seq).padStart(4, "0")}` };
  },

  rawGet(dbKey: string): string | null {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(dbKey);
    return row ? String(row.value) : null;
  },
};

export { DEFAULTS as DEFAULT_SETTINGS };

/**
 * Aponta quais dados de identidade da oficina ainda estão vazios ou iguais ao
 * exemplo do seed — ou seja, o que falta preencher em Configurações antes de
 * imprimir uma OS com o cabeçalho correto.
 *
 * Retorna rótulos em pt-BR prontos para exibição. Lista vazia = tudo configurado.
 */
export function identityGaps(s: WorkshopSettings): string[] {
  const gaps: string[] = [];

  /** Campo pendente quando vazio ou idêntico ao exemplo do seed. */
  const pending = (value: string, sample: string) =>
    !value.trim() || value.trim() === sample;

  const name = s.workshopName.trim();
  if (!name || name === SAMPLE_IDENTITY.workshopName || name === DEFAULTS.workshopName) {
    gaps.push("nome da oficina");
  }
  if (pending(s.document, SAMPLE_IDENTITY.document)) gaps.push("CNPJ");
  if (pending(s.phone, SAMPLE_IDENTITY.phone)) gaps.push("telefone");
  if (pending(s.address, SAMPLE_IDENTITY.address)) gaps.push("endereço");

  return gaps;
}
