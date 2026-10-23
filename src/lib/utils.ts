import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/* ---------------------------------- dinheiro -------------------------------- */

/** Formata centavos como R$ 1.234,56 */
export function formatMoney(cents: number | null | undefined): string {
  const value = (Number(cents ?? 0) || 0) / 100;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Formata centavos sem o símbolo (para inputs). */
export function formatMoneyPlain(cents: number | null | undefined): string {
  const value = (Number(cents ?? 0) || 0) / 100;
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Converte "1.234,56" | "1234.56" | 1234.56 em centavos (inteiro). */
export function toCents(input: unknown): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const raw = String(input).trim().replace(/[R$\s]/g, "");
  if (!raw) return 0;
  // formato brasileiro: 1.234,56
  const hasComma = raw.includes(",");
  const normalized = hasComma
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

/* ----------------------------------- datas --------------------------------- */

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const text = String(value).trim();

  /*
   * Data sem hora ("2026-10-19" — formato em que gravamos entry_date,
   * expected_finish e paid_at) precisa ser interpretada como data LOCAL.
   *
   * O JavaScript trata date-only ISO como meia-noite **UTC**; em fusos de
   * deslocamento negativo (Brasil, UTC-3) isso faz `getDate()` devolver o dia
   * anterior e toda data apareceria um dia antes na tela.
   */
  const dateOnly = DATE_ONLY.exec(text);
  if (dateOnly) {
    const local = new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
    );
    return Number.isNaN(local.getTime()) ? null : local;
  }

  // Timestamp completo (ex.: delivered_at) mantém a semântica de instante UTC
  // e é exibido no fuso local.
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Data ISO local (YYYY-MM-DD) para uma data, no fuso do servidor/navegador. */
export function toISODate(value: string | Date | null | undefined): string | null {
  const d = toDate(value);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 12/03/2026 */
export function formatDate(value: string | Date | null | undefined): string {
  const iso = toISODate(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** 12/03/2026 14:30 (usa hora local de um timestamp ISO) */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)} ${hh}:${mm}`;
}

/** 12 mar 2026 */
export function formatShortDate(value: string | Date | null | undefined): string {
  const iso = toISODate(value);
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS_PT[Number(m) - 1]} ${y}`;
}

/** mar/26 */
export function formatMonthLabel(year: number, monthZeroBased: number): string {
  return `${MONTHS_PT[monthZeroBased]}/${String(year).slice(2)}`;
}

export function todayISO(): string {
  return toISODate(new Date()) as string;
}

export function startOfMonthISO(ref = new Date()): string {
  return toISODate(new Date(ref.getFullYear(), ref.getMonth(), 1)) as string;
}

export function endOfMonthISO(ref = new Date()): string {
  return toISODate(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)) as string;
}

export function addDaysISO(days: number, ref = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + days);
  return toISODate(d) as string;
}

/** Diferença em dias entre uma data ISO e hoje (positivo = atrasado). */
export function daysSince(iso: string | null | undefined): number | null {
  const d = toISODate(iso);
  if (!d) return null;
  const today = new Date();
  const a = Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)));
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((b - a) / 86400000);
}

/** "hoje", "ontem", "há 3 dias", "em 2 dias" */
export function relativeDay(iso: string | null | undefined): string {
  const diff = daysSince(iso);
  if (diff === null) return "—";
  if (diff === 0) return "hoje";
  if (diff === 1) return "ontem";
  if (diff === -1) return "amanhã";
  if (diff > 1) return `há ${diff} dias`;
  return `em ${Math.abs(diff)} dias`;
}

/* ---------------------------------- textos --------------------------------- */

/** Placa: uppercase e sem espaços/hífens. */
export function normalizePlate(plate: string): string {
  return String(plate ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

/** (21) 99999-9999 */
export function formatPhone(input: string | null | undefined): string {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

/** 123.456.789-09 ou 12.345.678/0001-90 */
export function formatDocument(
  input: string | null | undefined,
  personType: "FISICA" | "JURIDICA" = "FISICA",
): string {
  const d = String(input ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (personType === "JURIDICA" && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return d;
}

export function onlyDigits(input: string | null | undefined): string {
  return String(input ?? "").replace(/\D/g, "");
}

export function initials(name: string): string {
  const parts = String(name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function vehicleLabel(v: {
  brand?: string | null;
  model?: string | null;
  plate?: string | null;
  year?: number | null;
}): string {
  const name = [v.brand, v.model].filter(Boolean).join(" ");
  const year = v.year ? ` ${v.year}` : "";
  const plate = v.plate ? ` · ${v.plate}` : "";
  return `${name || "Veículo"}${year}${plate}`;
}
