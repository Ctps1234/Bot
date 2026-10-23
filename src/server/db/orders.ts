import { getDb } from "./index";
import {
  mapOrder,
  mapOrderItem,
  mapPayment,
  nowISO,
  num,
  strOrNull,
} from "./mappers";
import { clientsRepo } from "./clients";
import { settingsRepo } from "./settings";
import { usersRepo } from "./users";
import type {
  FinancialStatus,
  ItemKind,
  Order,
  OrderItem,
  OrderStatus,
  OrderWithRelations,
  Payment,
  PaymentMethod,
} from "@/lib/types";
import { normalizePlate, toISODate } from "@/lib/utils";

export interface OrderInput {
  clientId: number;
  vehicleId: number;
  entryDate: string;
  expectedFinish?: string | null;
  mileageIn?: number | null;
  fuelLevel?: number | null;
  reportedIssue?: string;
  diagnosis?: string;
  notes?: string;
  warrantyMonths?: number;
  technicianId?: number | null;
  discountCents?: number;
  status?: OrderStatus;
  createdBy?: number | null;
}

export interface OrderItemInput {
  kind: ItemKind;
  description: string;
  quantity?: number;
  unitPriceCents?: number;
  warrantyMonths?: number;
  notes?: string | null;
}

export interface OrderFilters {
  q?: string;
  status?: OrderStatus | "TODAS" | "ATIVAS";
  financialStatus?: FinancialStatus | "TODAS";
  clientId?: number;
  vehicleId?: number;
  technicianId?: number;
  from?: string | null;
  to?: string | null;
  limit?: number;
  offset?: number;
}

/** Deriva o status financeiro a partir de total e valor pago. */
export function deriveFinancialStatus(
  totalCents: number,
  paidCents: number,
): FinancialStatus {
  if (paidCents <= 0) return "PENDENTE";
  if (paidCents >= totalCents) return "PAGO";
  return "PARCIAL";
}

function touchOrder(db: ReturnType<typeof getDb>, orderId: number) {
  db.prepare("UPDATE orders SET updated_at = ? WHERE id = ?").run(nowISO(), orderId);
}

/** Recalcula itens_total, total, pago e status financeiro de uma OS. */
export function recomputeOrderTotals(orderId: number): Order | null {
  const db = getDb();
  const items = Number(
    db
      .prepare("SELECT COALESCE(SUM(total_cents),0) AS s FROM order_items WHERE order_id = ?")
      .get(orderId)?.s ?? 0,
  );
  const paid = Number(
    db
      .prepare("SELECT COALESCE(SUM(amount_cents),0) AS s FROM payments WHERE order_id = ?")
      .get(orderId)?.s ?? 0,
  );
  const order = ordersRepo.findById(orderId);
  if (!order) return null;

  const discount = Math.max(0, Math.min(order.discountCents, items));
  const total = Math.max(0, items - discount);

  db.prepare(
    `UPDATE orders
       SET items_total_cents = ?, discount_cents = ?, total_cents = ?,
           paid_cents = ?, financial_status = ?, updated_at = ?
     WHERE id = ?`,
  ).run(items, discount, total, paid, deriveFinancialStatus(total, paid), nowISO(), orderId);

  return ordersRepo.findById(orderId);
}

/**
 * Aplica os timestamps automáticos conforme o status.
 *
 * Marca o milestone ao avançar e limpa os posteriores ao retroceder, para uma OS
 * reaberta não ficar com data de entrega fantasma.
 */
export function statusTimestampPatch(
  status: OrderStatus,
  current: Order,
): Partial<Record<"finishedAt" | "deliveredAt" | "canceledAt", string | null>> {
  const patch: Partial<Record<"finishedAt" | "deliveredAt" | "canceledAt", string | null>> = {};
  const now = nowISO();

  if (status === "CONCLUIDA" && !current.finishedAt) patch.finishedAt = now;
  if (status === "ENTREGUE") {
    if (!current.finishedAt) patch.finishedAt = now;
    if (!current.deliveredAt) patch.deliveredAt = now;
  }
  if (status === "CANCELADA" && !current.canceledAt) patch.canceledAt = now;

  // Reabrir/retroceder limpa os marcos posteriores.
  if (status === "ABERTA") {
    patch.finishedAt = null;
    patch.deliveredAt = null;
    patch.canceledAt = null;
  }
  if (status === "EM_EXECUCAO") {
    patch.deliveredAt = null;
    patch.canceledAt = null;
    if (current.finishedAt) patch.finishedAt = null;
  }
  if (status === "CONCLUIDA") {
    patch.deliveredAt = null;
    patch.canceledAt = null;
  }
  return patch;
}

const BASE_JOIN = `
  FROM orders o
  JOIN clients c ON c.id = o.client_id
  JOIN vehicles v ON v.id = o.vehicle_id
  LEFT JOIN users t ON t.id = o.technician_id
`;

const BASE_COLUMNS = `
  o.*, c.name AS client_name, c.phone AS client_phone, c.document AS client_document,
  c.address AS client_address, c.person_type AS client_person_type,
  v.plate AS vehicle_plate, v.brand AS vehicle_brand, v.model AS vehicle_model,
  v.year AS vehicle_year, v.color AS vehicle_color, v.voltage AS vehicle_voltage,
  v.fleet_number AS vehicle_fleet_number, t.name AS technician_name
`;

export const ordersRepo = {
  /* ---------------------------------- listas --------------------------------- */

  list(filters: OrderFilters = {}): { rows: OrderWithRelations[]; total: number } {
    const db = getDb();
    const where: string[] = ["1 = 1"];
    const params: (string | number)[] = [];

    const q = filters.q?.trim();
    if (q) {
      where.push(
        `(o.number LIKE ? OR c.name LIKE ? OR v.plate LIKE ? OR v.model LIKE ? OR v.brand LIKE ? OR o.reported_issue LIKE ?)`,
      );
      const like = `%${q}%`;
      const plate = `%${normalizePlate(q)}%`;
      params.push(like, like, plate, like, like, like);
    }

    if (filters.status && filters.status !== "TODAS") {
      if (filters.status === "ATIVAS") {
        where.push(`o.status IN ('ABERTA','EM_EXECUCAO','CONCLUIDA')`);
      } else {
        where.push("o.status = ?");
        params.push(filters.status);
      }
    }

    if (filters.financialStatus && filters.financialStatus !== "TODAS") {
      where.push("o.financial_status = ?");
      params.push(filters.financialStatus);
    }
    if (filters.clientId) {
      where.push("o.client_id = ?");
      params.push(filters.clientId);
    }
    if (filters.vehicleId) {
      where.push("o.vehicle_id = ?");
      params.push(filters.vehicleId);
    }
    if (filters.technicianId) {
      where.push("o.technician_id = ?");
      params.push(filters.technicianId);
    }
    if (filters.from) {
      where.push("o.entry_date >= ?");
      params.push(filters.from);
    }
    if (filters.to) {
      where.push("o.entry_date <= ?");
      params.push(filters.to);
    }

    const whereSql = where.join(" AND ");
    const total = num(
      db.prepare(`SELECT COUNT(*) AS c ${BASE_JOIN} WHERE ${whereSql}`).get(...params)?.c,
    );

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const rows = db
      .prepare(
        `SELECT ${BASE_COLUMNS} ${BASE_JOIN} WHERE ${whereSql}
         ORDER BY o.entry_date DESC, o.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);

    return {
      rows: rows.map((r) => this.hydrate(r, { items: false, payments: false })),
      total,
    };
  },

  findById(id: number): Order | null {
    const row = getDb().prepare("SELECT * FROM orders WHERE id = ?").get(id);
    return row ? mapOrder(row) : null;
  },

  findByNumber(number: string): Order | null {
    const row = getDb()
      .prepare("SELECT * FROM orders WHERE number = ? LIMIT 1")
      .get(number.trim());
    return row ? mapOrder(row) : null;
  },

  /** Detalhe completo (cliente, veículo, itens, pagamentos, técnico). */
  findDetailed(id: number): OrderWithRelations | null {
    const row = getDb()
      .prepare(`SELECT ${BASE_COLUMNS} ${BASE_JOIN} WHERE o.id = ?`)
      .get(id);
    if (!row) return null;
    return this.hydrate(row, { items: true, payments: true });
  },

  hydrate(
    row: Record<string, unknown>,
    opts: { items: boolean; payments: boolean },
  ): OrderWithRelations {
    const db = getDb();
    const order = mapOrder(row);
    const items = opts.items
      ? db
          .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY sort, id")
          .all(order.id)
          .map(mapOrderItem)
      : [];
    const payments = opts.payments
      ? db
          .prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at DESC, id DESC")
          .all(order.id)
          .map(mapPayment)
      : [];

    const client = clientsRepo.findById(order.clientId)!;
    const vehicle = clientsRepo.vehicleById(order.vehicleId)!;
    const technician = order.technicianId
      ? usersRepo.findById(order.technicianId)
      : null;

    return {
      ...order,
      client: client ?? ({ id: order.clientId, name: strOrNull(row.client_name) ?? "—" } as never),
      vehicle:
        vehicle ??
        ({
          id: order.vehicleId,
          clientId: order.clientId,
          plate: strOrNull(row.vehicle_plate) ?? "—",
        } as never),
      technician: technician ? { id: technician.id, name: technician.name } : null,
      items,
      payments,
      balanceCents: Math.max(0, order.totalCents - order.paidCents),
    };
  },

  /* --------------------------------- criação -------------------------------- */

  create(input: OrderInput): OrderWithRelations {
    const db = getDb();
    const ts = nowISO();
    const settings = settingsRepo.all();
    const status: OrderStatus = input.status ?? "ABERTA";

    const created = db.transaction(() => {
      const { number } = settingsRepo.nextOrderNumber();
      const mileage =
        input.mileageIn === null || input.mileageIn === undefined
          ? null
          : Math.max(0, Math.round(Number(input.mileageIn)));
      const fuel =
        input.fuelLevel === null || input.fuelLevel === undefined
          ? null
          : Math.max(0, Math.min(100, Math.round(Number(input.fuelLevel))));

      const res = db
        .prepare(
          `INSERT INTO orders
            (number, client_id, vehicle_id, status, entry_date, expected_finish,
             mileage_in, fuel_level, reported_issue, diagnosis, notes, warranty_months,
             technician_id, discount_cents, created_by, created_at, updated_at,
             finished_at, delivered_at, canceled_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          number,
          input.clientId,
          input.vehicleId,
          status,
          input.entryDate,
          input.expectedFinish ? toISODate(input.expectedFinish) : null,
          mileage,
          fuel,
          (input.reportedIssue ?? "").trim(),
          (input.diagnosis ?? "").trim(),
          (input.notes ?? "").trim(),
          input.warrantyMonths ?? settings.defaultWarrantyMonths ?? 3,
          input.technicianId ?? null,
          Math.max(0, Math.round(input.discountCents ?? 0)),
          input.createdBy ?? null,
          ts,
          ts,
          status === "CONCLUIDA" || status === "ENTREGUE" ? ts : null,
          status === "ENTREGUE" ? ts : null,
          status === "CANCELADA" ? ts : null,
        );
      return num(res.lastInsertRowid);
    });

    return this.findDetailed(created)!;
  },

  /* -------------------------------- atualização ------------------------------ */

  update(
    id: number,
    patch: Partial<
      Pick<
        Order,
        | "entryDate"
        | "expectedFinish"
        | "mileageIn"
        | "fuelLevel"
        | "reportedIssue"
        | "diagnosis"
        | "notes"
        | "warrantyMonths"
        | "technicianId"
        | "discountCents"
        | "clientId"
        | "vehicleId"
      >
    > & { status?: OrderStatus },
  ): Order | null {
    const db = getDb();
    const current = this.findById(id);
    if (!current) return null;

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (patch.entryDate !== undefined) {
      fields.push("entry_date = ?");
      values.push(toISODate(patch.entryDate) ?? current.entryDate);
    }
    if (patch.expectedFinish !== undefined) {
      fields.push("expected_finish = ?");
      values.push(patch.expectedFinish ? toISODate(patch.expectedFinish) : null);
    }
    if (patch.mileageIn !== undefined) {
      fields.push("mileage_in = ?");
      values.push(
        patch.mileageIn === null ? null : Math.max(0, Math.round(Number(patch.mileageIn))),
      );
    }
    if (patch.fuelLevel !== undefined) {
      fields.push("fuel_level = ?");
      values.push(
        patch.fuelLevel === null
          ? null
          : Math.max(0, Math.min(100, Math.round(Number(patch.fuelLevel)))),
      );
    }
    const TEXT_FIELDS = [
      ["reportedIssue", "reported_issue"],
      ["diagnosis", "diagnosis"],
      ["notes", "notes"],
    ] as const;
    for (const [field, column] of TEXT_FIELDS) {
      const value = patch[field];
      if (typeof value !== "string") continue;
      fields.push(`${column} = ?`);
      values.push(value.trim());
    }
    if (patch.warrantyMonths !== undefined) {
      fields.push("warranty_months = ?");
      values.push(Math.max(0, Math.round(Number(patch.warrantyMonths))));
    }
    if (patch.technicianId !== undefined) {
      fields.push("technician_id = ?");
      values.push(patch.technicianId);
    }
    if (patch.clientId !== undefined) {
      fields.push("client_id = ?");
      values.push(patch.clientId);
    }
    if (patch.vehicleId !== undefined) {
      fields.push("vehicle_id = ?");
      values.push(patch.vehicleId);
    }

    if (patch.status && patch.status !== current.status) {
      fields.push("status = ?");
      values.push(patch.status);
      const stamps = statusTimestampPatch(patch.status, current);
      if (stamps.finishedAt !== undefined) {
        fields.push("finished_at = ?");
        values.push(stamps.finishedAt);
      }
      if (stamps.deliveredAt !== undefined) {
        fields.push("delivered_at = ?");
        values.push(stamps.deliveredAt);
      }
      if (stamps.canceledAt !== undefined) {
        fields.push("canceled_at = ?");
        values.push(stamps.canceledAt);
      }
    }

    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(nowISO(), id);
      db.prepare(`UPDATE orders SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    }

    // desconto pode ter mudado -> recalcula totais
    if (patch.discountCents !== undefined) {
      db.prepare("UPDATE orders SET discount_cents = ? WHERE id = ?").run(
        Math.max(0, Math.round(Number(patch.discountCents))),
        id,
      );
    }
    return recomputeOrderTotals(id);
  },

  /** Mudança de status isolada (usada pelos botões de avanço do fluxo). */
  setStatus(id: number, status: OrderStatus): Order | null {
    return this.update(id, { status });
  },

  cancel(id: number, reason?: string): Order | null {
    const order = this.findById(id);
    if (!order) return null;
    const notes = reason?.trim()
      ? `${order.notes ? `${order.notes}\n` : ""}Cancelada: ${reason.trim()}`
      : order.notes;
    return this.update(id, { status: "CANCELADA", notes });
  },

  /* ----------------------------------- itens --------------------------------- */

  itemsOf(orderId: number): OrderItem[] {
    return getDb()
      .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY sort, id")
      .all(orderId)
      .map(mapOrderItem);
  },

  addItem(orderId: number, input: OrderItemInput): Order | null {
    const db = getDb();
    const quantity = Math.max(0.01, Number(input.quantity ?? 1) || 1);
    const unitPrice = Math.max(0, Math.round(Number(input.unitPriceCents ?? 0)));
    const maxSort = num(
      db.prepare("SELECT COALESCE(MAX(sort),0) AS s FROM order_items WHERE order_id = ?").get(orderId)?.s,
    );

    db.prepare(
      `INSERT INTO order_items
        (order_id, kind, description, quantity, unit_price_cents, total_cents, warranty_months, notes, sort, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      orderId,
      input.kind,
      input.description.trim(),
      quantity,
      unitPrice,
      Math.round(quantity * unitPrice),
      Math.max(0, Math.round(Number(input.warrantyMonths ?? 0))),
      input.notes?.trim() || null,
      maxSort + 1,
      nowISO(),
    );
    return recomputeOrderTotals(orderId);
  },

  addItems(orderId: number, inputs: OrderItemInput[]): Order | null {
    const db = getDb();
    db.transaction(() => {
      for (const input of inputs) {
        if (!input.description?.trim()) continue;
        this.addItem(orderId, input);
      }
    });
    return recomputeOrderTotals(orderId);
  },

  updateItem(
    itemId: number,
    patch: Partial<OrderItemInput>,
  ): Order | null {
    const db = getDb();
    const row = db.prepare("SELECT * FROM order_items WHERE id = ?").get(itemId);
    if (!row) return null;
    const orderId = num(row.order_id);

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (patch.kind !== undefined) {
      fields.push("kind = ?");
      values.push(patch.kind);
    }
    if (patch.description !== undefined) {
      fields.push("description = ?");
      values.push(patch.description.trim());
    }
    if (patch.notes !== undefined) {
      fields.push("notes = ?");
      values.push(patch.notes?.trim() || null);
    }
    if (patch.warrantyMonths !== undefined) {
      fields.push("warranty_months = ?");
      values.push(Math.max(0, Math.round(Number(patch.warrantyMonths))));
    }

    const quantity =
      patch.quantity !== undefined
        ? Math.max(0.01, Number(patch.quantity) || 1)
        : Number(row.quantity);
    const unitPrice =
      patch.unitPriceCents !== undefined
        ? Math.max(0, Math.round(Number(patch.unitPriceCents)))
        : num(row.unit_price_cents);

    if (patch.quantity !== undefined) {
      fields.push("quantity = ?");
      values.push(quantity);
    }
    if (patch.unitPriceCents !== undefined) {
      fields.push("unit_price_cents = ?");
      values.push(unitPrice);
    }
    fields.push("total_cents = ?");
    values.push(Math.round(quantity * unitPrice), itemId);

    db.prepare(`UPDATE order_items SET ${fields.join(", ")} WHERE id = ?`).run(...values);
    return recomputeOrderTotals(orderId);
  },

  deleteItem(itemId: number): Order | null {
    const db = getDb();
    const row = db.prepare("SELECT order_id FROM order_items WHERE id = ?").get(itemId);
    if (!row) return null;
    const orderId = num(row.order_id);
    db.prepare("DELETE FROM order_items WHERE id = ?").run(itemId);
    return recomputeOrderTotals(orderId);
  },

  /* -------------------------------- pagamentos ------------------------------- */

  paymentsOf(orderId: number): Payment[] {
    return getDb()
      .prepare("SELECT * FROM payments WHERE order_id = ? ORDER BY paid_at DESC, id DESC")
      .all(orderId)
      .map(mapPayment);
  },

  addPayment(input: {
    orderId: number;
    amountCents: number;
    method?: PaymentMethod;
    paidAt?: string;
    note?: string | null;
    createdBy?: number | null;
  }): { payment: Payment; order: Order } | { error: string } {
    const db = getDb();
    const amount = Math.round(Number(input.amountCents));
    if (!Number.isFinite(amount) || amount <= 0) {
      return { error: "Informe um valor maior que zero." };
    }
    const order = this.findById(input.orderId);
    if (!order) return { error: "Ordem de serviço não encontrada." };
    if (order.status === "CANCELADA") {
      return { error: "Não é possível receber pagamento de uma OS cancelada." };
    }

    const paidAt = toISODate(input.paidAt) ?? toISODate(new Date())!;
    const ts = nowISO();

    const paymentId = db.transaction(() => {
      const res = db
        .prepare(
          `INSERT INTO payments (order_id, method, amount_cents, paid_at, note, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.orderId,
          input.method ?? "DINHEIRO",
          amount,
          paidAt,
          input.note?.trim() || null,
          input.createdBy ?? null,
          ts,
        );
      return num(res.lastInsertRowid);
    });

    const updated = recomputeOrderTotals(input.orderId)!;
    const payment = this.paymentsOf(input.orderId).find((p) => p.id === paymentId)!;
    return { payment, order: updated };
  },

  deletePayment(paymentId: number): Order | null {
    const db = getDb();
    const row = db.prepare("SELECT order_id FROM payments WHERE id = ?").get(paymentId);
    if (!row) return null;
    const orderId = num(row.order_id);
    db.prepare("DELETE FROM payments WHERE id = ?").run(paymentId);
    return recomputeOrderTotals(orderId);
  },

  /* ------------------------------- consultas aux ---------------------------- */

  /** Última OS de um veículo (para preencher km e histórico). */
  lastOrderOfVehicle(vehicleId: number): Order | null {
    const row = getDb()
      .prepare("SELECT * FROM orders WHERE vehicle_id = ? ORDER BY entry_date DESC, id DESC LIMIT 1")
      .get(vehicleId);
    return row ? mapOrder(row) : null;
  },

  historyOfClient(clientId: number, limit = 20): OrderWithRelations[] {
    const rows = getDb()
      .prepare(
        `SELECT ${BASE_COLUMNS} ${BASE_JOIN} WHERE o.client_id = ?
         ORDER BY o.entry_date DESC, o.id DESC LIMIT ?`,
      )
      .all(clientId, limit);
    return rows.map((r) => this.hydrate(r, { items: false, payments: false }));
  },

  countByStatus(): { status: OrderStatus; count: number }[] {
    return getDb()
      .prepare("SELECT status, COUNT(*) AS count FROM orders GROUP BY status")
      .all()
      .map((r) => ({ status: String(r.status) as OrderStatus, count: num(r.count) }));
  },

  /**
   * Confere o hodômetro informado contra o histórico do veículo.
   *
   * Retorna um aviso **não bloqueante** quando a quilometragem é menor que a já
   * registrada em outra OS do mesmo veículo — quase sempre erro de digitação no
   * balcão (ex.: 12000 em vez de 120000). Hodômetro não anda para trás.
   *
   * `excludeOrderId` impede que a OS seja comparada com ela mesma ao editar.
   */
  mileageWarning(
    vehicleId: number,
    mileageIn: number | null,
    excludeOrderId?: number,
  ): string | null {
    if (!mileageIn || mileageIn <= 0) return null;

    const params: (string | number)[] = [vehicleId];
    let sql = `SELECT MAX(mileage_in) AS max_km
                 FROM orders
                WHERE vehicle_id = ?
                  AND mileage_in IS NOT NULL
                  AND status <> 'CANCELADA'`;
    if (excludeOrderId !== undefined) {
      sql += " AND id <> ?";
      params.push(excludeOrderId);
    }

    const row = getDb().prepare(sql).get(...params);
    const maxKm = num(row?.max_km);
    if (!maxKm || mileageIn >= maxKm) return null;

    const br = (n: number) => n.toLocaleString("pt-BR");
    return (
      `O hodômetro informado (${br(mileageIn)} km) é menor que o último registro deste ` +
      `veículo (${br(maxKm)} km). Hodômetro não anda para trás — confira o valor.`
    );
  },

  touch(id: number) {
    touchOrder(getDb(), id);
  },
};

export { recomputeOrderTotals as recalcOrder };
