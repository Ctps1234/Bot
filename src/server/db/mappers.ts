/** Helpers de mapeamento linha (snake_case) -> objeto de domínio (camelCase). */

import type { SqlRow } from "./index";
import {
  type Client,
  type FinancialStatus,
  type ItemKind,
  type Order,
  type OrderItem,
  type OrderStatus,
  type Payment,
  type PaymentMethod,
  type PersonType,
  type Role,
  type User,
  type Vehicle,
  type Voltage,
} from "@/lib/types";

export function str(v: unknown, fallback = ""): string {
  return v === null || v === undefined ? fallback : String(v);
}

export function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s === "" ? null : s;
}

export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1" || v === "true";
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function mapUser(r: SqlRow): User {
  return {
    id: num(r.id),
    name: str(r.name),
    email: str(r.email),
    role: str(r.role, "TECNICO") as Role,
    phone: strOrNull(r.phone),
    active: bool(r.active),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}

export function mapClient(r: SqlRow): Client {
  return {
    id: num(r.id),
    name: str(r.name),
    personType: str(r.person_type, "FISICA") as PersonType,
    document: strOrNull(r.document),
    phone: strOrNull(r.phone),
    email: strOrNull(r.email),
    address: strOrNull(r.address),
    notes: strOrNull(r.notes),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    deletedAt: strOrNull(r.deleted_at),
  };
}

export function mapVehicle(r: SqlRow): Vehicle {
  return {
    id: num(r.id),
    clientId: num(r.client_id),
    plate: str(r.plate),
    brand: strOrNull(r.brand),
    model: strOrNull(r.model),
    year: numOrNull(r.year),
    color: strOrNull(r.color),
    voltage: (str(r.voltage, "12V") || "12V") as Voltage,
    fleetNumber: strOrNull(r.fleet_number),
    notes: strOrNull(r.notes),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    deletedAt: strOrNull(r.deleted_at),
  };
}

export function mapOrderItem(r: SqlRow): OrderItem {
  return {
    id: num(r.id),
    orderId: num(r.order_id),
    kind: str(r.kind, "SERVICO") as ItemKind,
    description: str(r.description),
    quantity: num(r.quantity, 1),
    unitPriceCents: num(r.unit_price_cents),
    totalCents: num(r.total_cents),
    warrantyMonths: num(r.warranty_months),
    notes: strOrNull(r.notes),
    sort: num(r.sort),
    createdAt: str(r.created_at),
  };
}

export function mapPayment(r: SqlRow): Payment {
  return {
    id: num(r.id),
    orderId: num(r.order_id),
    method: str(r.method, "DINHEIRO") as PaymentMethod,
    amountCents: num(r.amount_cents),
    paidAt: str(r.paid_at),
    note: strOrNull(r.note),
    createdBy: numOrNull(r.created_by),
    createdAt: str(r.created_at),
  };
}

export function mapOrder(r: SqlRow): Order {
  return {
    id: num(r.id),
    number: str(r.number),
    clientId: num(r.client_id),
    vehicleId: num(r.vehicle_id),
    status: str(r.status, "ABERTA") as OrderStatus,
    entryDate: str(r.entry_date),
    expectedFinish: strOrNull(r.expected_finish),
    finishedAt: strOrNull(r.finished_at),
    deliveredAt: strOrNull(r.delivered_at),
    canceledAt: strOrNull(r.canceled_at),
    mileageIn: numOrNull(r.mileage_in),
    fuelLevel: numOrNull(r.fuel_level),
    reportedIssue: str(r.reported_issue),
    diagnosis: str(r.diagnosis),
    notes: str(r.notes),
    warrantyMonths: num(r.warranty_months, 3),
    technicianId: numOrNull(r.technician_id),
    discountCents: num(r.discount_cents),
    itemsTotalCents: num(r.items_total_cents),
    totalCents: num(r.total_cents),
    paidCents: num(r.paid_cents),
    financialStatus: str(r.financial_status, "PENDENTE") as FinancialStatus,
    createdBy: numOrNull(r.created_by),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
  };
}
