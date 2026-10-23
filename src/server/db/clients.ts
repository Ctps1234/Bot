import { getDb } from "./index";
import { mapClient, mapVehicle, nowISO } from "./mappers";
import type { Client, PersonType, Vehicle, Voltage } from "@/lib/types";
import { normalizePlate, onlyDigits } from "@/lib/utils";

export interface ClientInput {
  name: string;
  personType?: PersonType;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface VehicleInput {
  clientId: number;
  plate: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  voltage?: Voltage;
  fleetNumber?: string | null;
  notes?: string | null;
}

export interface ClientListFilters {
  q?: string;
  limit?: number;
  offset?: number;
}

const CLIENT_SELECT = "SELECT * FROM clients WHERE deleted_at IS NULL";

export const clientsRepo = {
  list(filters: ClientListFilters = {}): { rows: Client[]; total: number } {
    const db = getDb();
    const params: (string | number)[] = [];
    let where = "deleted_at IS NULL";

    const q = filters.q?.trim();
    if (q) {
      where += " AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR document LIKE ?)";
      const like = `%${q}%`;
      const digits = onlyDigits(q);
      params.push(like, like, like, digits ? `%${digits}%` : like);
    }

    const total = Number(
      db.prepare(`SELECT COUNT(*) AS c FROM clients WHERE ${where}`).get(...params)
        ?.c ?? 0,
    );

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);
    const rows = db
      .prepare(
        `${CLIENT_SELECT.replace("WHERE deleted_at IS NULL", `WHERE ${where}`)}
         ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset)
      .map(mapClient);

    return { rows, total };
  },

  /** Busca leve para autocomplete (nome, telefone ou placa de veículo). */
  search(q: string, limit = 8): Client[] {
    const term = q.trim();
    if (!term) return this.list({ limit }).rows;
    const like = `%${term}%`;
    const plate = normalizePlate(term);
    return getDb()
      .prepare(
        `SELECT DISTINCT c.* FROM clients c
         LEFT JOIN vehicles v ON v.client_id = c.id AND v.deleted_at IS NULL
         WHERE c.deleted_at IS NULL
           AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR v.plate LIKE ?)
         ORDER BY c.name COLLATE NOCASE
         LIMIT ?`,
      )
      .all(like, like, like, `%${plate}%`, Math.min(limit, 30))
      .map(mapClient);
  },

  findById(id: number): Client | null {
    const row = getDb()
      .prepare(`${CLIENT_SELECT} AND id = ?`)
      .get(id);
    return row ? mapClient(row) : null;
  },

  /** Busca por nome exato (case-insensitive) — usado para reaproveitar cliente na OS. */
  findByName(name: string): Client | null {
    const row = getDb()
      .prepare(
        `${CLIENT_SELECT} AND lower(name) = lower(?) ORDER BY id LIMIT 1`,
      )
      .get(name.trim());
    return row ? mapClient(row) : null;
  },

  create(input: ClientInput): Client {
    const db = getDb();
    const ts = nowISO();
    const res = db
      .prepare(
        `INSERT INTO clients (name, person_type, document, phone, email, address, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.personType ?? "FISICA",
        input.document?.trim() || null,
        input.phone?.trim() || null,
        input.email?.trim().toLowerCase() || null,
        input.address?.trim() || null,
        input.notes?.trim() || null,
        ts,
        ts,
      );
    return this.findById(Number(res.lastInsertRowid))!;
  },

  update(id: number, patch: Partial<ClientInput>): Client | null {
    const db = getDb();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    const map: [keyof ClientInput, string, (v: unknown) => string | number | null][] = [
      ["name", "name", (v) => String(v).trim()],
      ["personType", "person_type", (v) => String(v)],
      ["document", "document", (v) => (v ? String(v).trim() : null)],
      ["phone", "phone", (v) => (v ? String(v).trim() : null)],
      ["email", "email", (v) => (v ? String(v).trim().toLowerCase() : null)],
      ["address", "address", (v) => (v ? String(v).trim() : null)],
      ["notes", "notes", (v) => (v ? String(v).trim() : null)],
    ];

    for (const [field, column, transform] of map) {
      const value = patch[field];
      if (value === undefined) continue;
      fields.push(`${column} = ?`);
      values.push(transform(value));
    }
    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = ?");
    values.push(nowISO(), id);
    db.prepare(`UPDATE clients SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`).run(
      ...values,
    );
    return this.findById(id);
  },

  /** Soft delete — bloqueado se houver OS vinculada. */
  softDelete(id: number): { ok: boolean; error?: string } {
    const db = getDb();
    const orders = Number(
      db.prepare("SELECT COUNT(*) AS c FROM orders WHERE client_id = ?").get(id)?.c ?? 0,
    );
    if (orders > 0) {
      return {
        ok: false,
        error: `Este cliente possui ${orders} ordem(ns) de serviço e não pode ser excluído.`,
      };
    }
    db.prepare("UPDATE clients SET deleted_at = ?, updated_at = ? WHERE id = ?").run(
      nowISO(),
      nowISO(),
      id,
    );
    return { ok: true };
  },

  count(): number {
    return Number(
      getDb().prepare("SELECT COUNT(*) AS c FROM clients WHERE deleted_at IS NULL").get()?.c ?? 0,
    );
  },

  /* --------------------------------- veículos -------------------------------- */

  vehiclesOf(clientId: number): Vehicle[] {
    return getDb()
      .prepare(
        `SELECT * FROM vehicles WHERE client_id = ? AND deleted_at IS NULL
         ORDER BY plate COLLATE NOCASE`,
      )
      .all(clientId)
      .map(mapVehicle);
  },

  vehicleById(id: number): Vehicle | null {
    const row = getDb()
      .prepare("SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL")
      .get(id);
    return row ? mapVehicle(row) : null;
  },

  vehicleByPlate(plate: string): Vehicle | null {
    const p = normalizePlate(plate);
    if (!p) return null;
    const row = getDb()
      .prepare("SELECT * FROM vehicles WHERE plate = ? AND deleted_at IS NULL LIMIT 1")
      .get(p);
    return row ? mapVehicle(row) : null;
  },

  createVehicle(input: VehicleInput): Vehicle {
    const db = getDb();
    const ts = nowISO();
    const plate = normalizePlate(input.plate);
    const res = db
      .prepare(
        `INSERT INTO vehicles
          (client_id, plate, brand, model, year, color, voltage, fleet_number, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.clientId,
        plate,
        input.brand?.trim() || null,
        input.model?.trim() || null,
        input.year ?? null,
        input.color?.trim() || null,
        input.voltage ?? "12V",
        input.fleetNumber?.trim() || null,
        input.notes?.trim() || null,
        ts,
        ts,
      );
    return this.vehicleById(Number(res.lastInsertRowid))!;
  },

  /** Cria o veículo se a placa ainda não existir; caso exista, devolve o existente. */
  findOrCreateVehicle(input: VehicleInput): Vehicle {
    const existing = this.vehicleByPlate(input.plate);
    if (existing) return existing;
    return this.createVehicle(input);
  },

  updateVehicle(id: number, patch: Partial<VehicleInput>): Vehicle | null {
    const db = getDb();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (patch.plate !== undefined) {
      fields.push("plate = ?");
      values.push(normalizePlate(patch.plate));
    }
    const textFields: [keyof VehicleInput, string][] = [
      ["brand", "brand"],
      ["model", "model"],
      ["color", "color"],
      ["fleetNumber", "fleet_number"],
      ["notes", "notes"],
    ];
    for (const [field, column] of textFields) {
      const value = patch[field];
      if (value === undefined) continue;
      fields.push(`${column} = ?`);
      values.push(value ? String(value).trim() : null);
    }
    if (patch.year !== undefined) {
      fields.push("year = ?");
      values.push(patch.year ?? null);
    }
    if (patch.voltage !== undefined) {
      fields.push("voltage = ?");
      values.push(patch.voltage);
    }
    if (fields.length === 0) return this.vehicleById(id);

    fields.push("updated_at = ?");
    values.push(nowISO(), id);
    db.prepare(
      `UPDATE vehicles SET ${fields.join(", ")} WHERE id = ? AND deleted_at IS NULL`,
    ).run(...values);
    return this.vehicleById(id);
  },

  deleteVehicle(id: number): { ok: boolean; error?: string } {
    const db = getDb();
    const orders = Number(
      db.prepare("SELECT COUNT(*) AS c FROM orders WHERE vehicle_id = ?").get(id)?.c ?? 0,
    );
    if (orders > 0) {
      return {
        ok: false,
        error: `Este veículo possui ${orders} ordem(ns) de serviço e não pode ser excluído.`,
      };
    }
    db.prepare("UPDATE vehicles SET deleted_at = ?, updated_at = ? WHERE id = ?").run(
      nowISO(),
      nowISO(),
      id,
    );
    return { ok: true };
  },

  countVehicles(): number {
    return Number(
      getDb().prepare("SELECT COUNT(*) AS c FROM vehicles WHERE deleted_at IS NULL").get()?.c ?? 0,
    );
  },
};
