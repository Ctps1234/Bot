import { getDb } from "./index";
import { num, str } from "./mappers";
import type { OrderStatus, PaymentMethod } from "@/lib/types";
import { endOfMonthISO, startOfMonthISO, toISODate, todayISO } from "@/lib/utils";

export interface Period {
  from: string;
  to: string;
}

export function currentMonthPeriod(): Period {
  return { from: startOfMonthISO(), to: endOfMonthISO() };
}

export interface MonthlyBucket {
  /** YYYY-MM */
  month: string;
  label: string;
  revenueCents: number;
  orders: number;
}

export interface ReportData {
  period: Period;
  periodLabel: string;
  totals: {
    orders: number;
    delivered: number;
    canceled: number;
    partsCents: number;
    laborCents: number;
    revenueCents: number;
    receivedCents: number;
    receivableCents: number;
    avgTicketCents: number;
    avgPartsCents: number;
    avgLaborCents: number;
  };
  monthly: MonthlyBucket[];
  byStatus: { status: OrderStatus; count: number; totalCents: number }[];
  topServices: { description: string; count: number; revenueCents: number }[];
  topParts: { description: string; count: number; revenueCents: number }[];
  byMethod: { method: PaymentMethod; totalCents: number; count: number }[];
  byTechnician: { name: string; count: number; revenueCents: number }[];
  topClients: { name: string; count: number; revenueCents: number }[];
}

const MONTH_LABELS = [
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

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_LABELS[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

/** Gera a série de meses (YYYY-MM) entre from e to, inclusive. */
function monthSeries(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return out;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  let guard = 0;
  while (cursor <= last && guard < 240) {
    out.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setMonth(cursor.getMonth() + 1);
    guard += 1;
  }
  return out;
}

export interface DashboardKpis {
  openOrders: number;
  runningOrders: number;
  finishedOrders: number;
  deliveredThisMonth: number;
  monthRevenueCents: number;
  /** Total efetivamente recebido (pagamentos) no mês corrente. */
  receivedThisMonth: number;
  monthOrders: number;
  receivableCents: number;
  avgTicketCents: number;
  overdueOrders: number;
  activeOrders: number;
}

export const statsRepo = {
  dashboard(): DashboardKpis {
    const db = getDb();
    const { from, to } = currentMonthPeriod();
    const today = todayISO();

    const countStatus = (statuses: string[]) =>
      num(
        db
          .prepare(
            `SELECT COUNT(*) AS c FROM orders WHERE status IN (${statuses.map(() => "?").join(",")})`,
          )
          .get(...statuses)?.c,
      );

    const openOrders = countStatus(["ABERTA"]);
    const runningOrders = countStatus(["EM_EXECUCAO"]);
    const finishedOrders = countStatus(["CONCLUIDA"]);

    const monthOrders = num(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM orders
            WHERE status <> 'CANCELADA' AND entry_date BETWEEN ? AND ?`,
        )
        .get(from, to)?.c,
    );

    const monthRevenue = db
      .prepare(
        `SELECT COALESCE(SUM(total_cents),0) AS s FROM orders
          WHERE status <> 'CANCELADA' AND entry_date BETWEEN ? AND ?`,
      )
      .get(from, to);

    const receivedThisMonth = num(
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_cents),0) AS s FROM payments
            WHERE paid_at BETWEEN ? AND ?`,
        )
        .get(from, to)?.s,
    );

    const receivable = num(
      db
        .prepare(
          `SELECT COALESCE(SUM(total_cents - paid_cents),0) AS s FROM orders
            WHERE status <> 'CANCELADA' AND financial_status <> 'PAGO'`,
        )
        .get()?.s,
    );

    /*
     * `delivered_at` é um instante UTC (ISO completo), enquanto `from`/`to` são
     * datas locais. O modificador 'localtime' converte o instante para o fuso do
     * servidor antes de extrair o dia — sem ele, entregas feitas no fim do dia
     * cairiam no mês errado em fusos negativos (Brasil, UTC-3).
     */
    const deliveredThisMonth = num(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM orders
            WHERE delivered_at IS NOT NULL
              AND date(delivered_at, 'localtime') BETWEEN ? AND ?`,
        )
        .get(from, to)?.c,
    );

    // Atrasadas: previsão de entrega já passou e ainda não foi entregue/cancelada
    const overdueOrders = num(
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM orders
            WHERE expected_finish IS NOT NULL AND expected_finish < ?
              AND status IN ('ABERTA','EM_EXECUCAO')`,
        )
        .get(today)?.c,
    );

    return {
      openOrders,
      runningOrders,
      finishedOrders,
      deliveredThisMonth,
      monthRevenueCents: num(monthRevenue?.s),
      monthOrders,
      receivableCents: receivable,
      avgTicketCents: monthOrders > 0 ? Math.round(num(monthRevenue?.s) / monthOrders) : 0,
      overdueOrders,
      activeOrders: openOrders + runningOrders + finishedOrders,
      receivedThisMonth,
    };
  },

  report(from: string, to: string): ReportData {
    const db = getDb();
    const period: Period = { from, to };

    const inPeriod = `o.entry_date BETWEEN ? AND ?`;

    const totalsRow = db
      .prepare(
        `SELECT
           COUNT(*) AS orders,
           SUM(CASE WHEN o.status = 'ENTREGUE' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN o.status = 'CANCELADA' THEN 1 ELSE 0 END) AS canceled,
           COALESCE(SUM(CASE WHEN o.status <> 'CANCELADA' THEN o.total_cents ELSE 0 END),0) AS revenue,
           COALESCE(AVG(CASE WHEN o.status <> 'CANCELADA' THEN o.total_cents END),0) AS avg_ticket
         FROM orders o WHERE ${inPeriod}`,
      )
      .get(from, to);

    const splitRow = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN i.kind = 'PECA' THEN i.total_cents ELSE 0 END),0) AS parts,
           COALESCE(SUM(CASE WHEN i.kind = 'SERVICO' THEN i.total_cents ELSE 0 END),0) AS labor,
           COALESCE(AVG(CASE WHEN i.kind = 'PECA' THEN i.total_cents END),0) AS avg_parts,
           COALESCE(AVG(CASE WHEN i.kind = 'SERVICO' THEN i.total_cents END),0) AS avg_labor
         FROM order_items i JOIN orders o ON o.id = i.order_id
         WHERE ${inPeriod} AND o.status <> 'CANCELADA'`,
      )
      .get(from, to);

    const receivedCents = num(
      db
        .prepare("SELECT COALESCE(SUM(amount_cents),0) AS s FROM payments WHERE paid_at BETWEEN ? AND ?")
        .get(from, to)?.s,
    );
    const revenueCents = num(totalsRow?.revenue);
    const orders = num(totalsRow?.orders);

    // Série mensal: receita por mês (pagamentos recebidos) + OS abertas no mês
    const monthlyRows = db
      .prepare(
        `SELECT substr(o.entry_date,1,7) AS month,
                COALESCE(SUM(CASE WHEN o.status <> 'CANCELADA' THEN o.total_cents ELSE 0 END),0) AS revenue,
                COUNT(*) AS orders
           FROM orders o WHERE ${inPeriod} GROUP BY month ORDER BY month`,
      )
      .all(from, to);

    const receivedByMonth = db
      .prepare(
        `SELECT substr(paid_at,1,7) AS month, COALESCE(SUM(amount_cents),0) AS revenue
           FROM payments WHERE paid_at BETWEEN ? AND ? GROUP BY month`,
      )
      .all(from, to);
    const receivedMap = new Map(
      receivedByMonth.map((r) => [str(r.month), num(r.revenue)]),
    );

    const monthly: MonthlyBucket[] = monthSeries(from, to).map((month) => {
      const row = monthlyRows.find((r) => str(r.month) === month);
      return {
        month,
        label: monthLabel(month),
        revenueCents: receivedMap.get(month) ?? (row ? num(row.revenue) : 0),
        orders: row ? num(row.orders) : 0,
      };
    });

    const byStatus = db
      .prepare(
        `SELECT o.status AS status, COUNT(*) AS count,
                COALESCE(SUM(o.total_cents),0) AS total_cents
           FROM orders o WHERE ${inPeriod} GROUP BY o.status`,
      )
      .all(from, to)
      .map((r) => ({
        status: str(r.status) as OrderStatus,
        count: num(r.count),
        totalCents: num(r.total_cents),
      }));

    const topServices = db
      .prepare(
        `SELECT i.description AS description, COUNT(*) AS count,
                COALESCE(SUM(i.total_cents),0) AS revenue_cents
           FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE ${inPeriod} AND i.kind = 'SERVICO' AND o.status <> 'CANCELADA'
          GROUP BY lower(i.description)
          ORDER BY revenue_cents DESC LIMIT 10`,
      )
      .all(from, to)
      .map((r) => ({
        description: str(r.description),
        count: num(r.count),
        revenueCents: num(r.revenue_cents),
      }));

    const topParts = db
      .prepare(
        `SELECT i.description AS description, COUNT(*) AS count,
                COALESCE(SUM(i.total_cents),0) AS revenue_cents
           FROM order_items i JOIN orders o ON o.id = i.order_id
          WHERE ${inPeriod} AND i.kind = 'PECA' AND o.status <> 'CANCELADA'
          GROUP BY lower(i.description)
          ORDER BY revenue_cents DESC LIMIT 10`,
      )
      .all(from, to)
      .map((r) => ({
        description: str(r.description),
        count: num(r.count),
        revenueCents: num(r.revenue_cents),
      }));

    const byMethod = db
      .prepare(
        `SELECT p.method AS method, COALESCE(SUM(p.amount_cents),0) AS total_cents, COUNT(*) AS count
           FROM payments p WHERE p.paid_at BETWEEN ? AND ?
          GROUP BY p.method ORDER BY total_cents DESC`,
      )
      .all(from, to)
      .map((r) => ({
        method: str(r.method) as PaymentMethod,
        totalCents: num(r.total_cents),
        count: num(r.count),
      }));

    const byTechnician = db
      .prepare(
        `SELECT COALESCE(t.name,'Sem responsável') AS name, COUNT(*) AS count,
                COALESCE(SUM(CASE WHEN o.status <> 'CANCELADA' THEN o.total_cents ELSE 0 END),0) AS revenue_cents
           FROM orders o LEFT JOIN users t ON t.id = o.technician_id
          WHERE ${inPeriod} GROUP BY t.name ORDER BY revenue_cents DESC`,
      )
      .all(from, to)
      .map((r) => ({
        name: str(r.name),
        count: num(r.count),
        revenueCents: num(r.revenue_cents),
      }));

    const topClients = db
      .prepare(
        `SELECT c.name AS name, COUNT(*) AS count,
                COALESCE(SUM(o.total_cents),0) AS revenue_cents
           FROM orders o JOIN clients c ON c.id = o.client_id
          WHERE ${inPeriod} AND o.status <> 'CANCELADA'
          GROUP BY c.id ORDER BY revenue_cents DESC LIMIT 8`,
      )
      .all(from, to)
      .map((r) => ({
        name: str(r.name),
        count: num(r.count),
        revenueCents: num(r.revenue_cents),
      }));

    const partsCents = num(splitRow?.parts);
    const laborCents = num(splitRow?.labor);

    return {
      period,
      periodLabel: `${toISODate(from)} → ${toISODate(to)}`,
      totals: {
        orders,
        delivered: num(totalsRow?.delivered),
        canceled: num(totalsRow?.canceled),
        partsCents,
        laborCents,
        revenueCents,
        receivedCents,
        receivableCents: Math.max(0, revenueCents - receivedCents),
        avgTicketCents: Math.round(num(totalsRow?.avg_ticket)),
        avgPartsCents: Math.round(num(splitRow?.avg_parts)),
        avgLaborCents: Math.round(num(splitRow?.avg_labor)),
      },
      monthly,
      byStatus,
      topServices,
      topParts,
      byMethod,
      byTechnician,
      topClients,
    };
  },

  /** Recebimentos e pendências por OS (tela Financeiro). */
  financial(filters: {
    q?: string;
    financialStatus?: string;
    from?: string | null;
    to?: string | null;
    limit?: number;
    offset?: number;
  }) {
    const db = getDb();
    const where: string[] = ["o.status <> 'CANCELADA'"];
    const params: (string | number)[] = [];

    if (filters.q?.trim()) {
      where.push("(o.number LIKE ? OR c.name LIKE ? OR v.plate LIKE ?)");
      const like = `%${filters.q.trim()}%`;
      params.push(like, like, like);
    }
    if (filters.financialStatus && filters.financialStatus !== "TODAS") {
      where.push("o.financial_status = ?");
      params.push(filters.financialStatus);
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

    const totals = db
      .prepare(
        `SELECT COALESCE(SUM(o.total_cents),0) AS total,
                COALESCE(SUM(o.paid_cents),0) AS paid,
                COALESCE(SUM(o.total_cents - o.paid_cents),0) AS balance,
                COUNT(*) AS orders
           FROM orders o JOIN clients c ON c.id = o.client_id
           JOIN vehicles v ON v.id = o.vehicle_id
          WHERE ${whereSql}`,
      )
      .get(...params);

    const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    const rows = db
      .prepare(
        `SELECT o.*, c.name AS client_name, v.plate AS vehicle_plate,
                v.brand AS vehicle_brand, v.model AS vehicle_model
           FROM orders o JOIN clients c ON c.id = o.client_id
           JOIN vehicles v ON v.id = o.vehicle_id
          WHERE ${whereSql}
          ORDER BY (o.total_cents - o.paid_cents) DESC, o.entry_date DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset);

    return {
      totals: {
        totalCents: num(totals?.total),
        paidCents: num(totals?.paid),
        balanceCents: num(totals?.balance),
        orders: num(totals?.orders),
      },
      rows: rows.map((r) => ({
        id: num(r.id),
        number: str(r.number),
        status: str(r.status) as OrderStatus,
        entryDate: str(r.entry_date),
        deliveredAt: strOrNullSafe(r.delivered_at),
        financialStatus: str(r.financial_status) as "PENDENTE" | "PARCIAL" | "PAGO",
        totalCents: num(r.total_cents),
        paidCents: num(r.paid_cents),
        balanceCents: Math.max(0, num(r.total_cents) - num(r.paid_cents)),
        clientName: str(r.client_name),
        vehiclePlate: str(r.vehicle_plate),
        vehicleLabel: [r.vehicle_brand, r.vehicle_model].filter(Boolean).join(" "),
      })),
    };
  },

  /** Últimas OS para o dashboard. */
  recentOrders(limit = 8) {
    return getDb()
      .prepare(
        `SELECT o.id, o.number, o.status, o.entry_date, o.expected_finish, o.total_cents,
                o.paid_cents, o.financial_status, c.name AS client_name,
                v.plate AS vehicle_plate, v.brand AS vehicle_brand, v.model AS vehicle_model
           FROM orders o
           JOIN clients c ON c.id = o.client_id
           JOIN vehicles v ON v.id = o.vehicle_id
          ORDER BY o.updated_at DESC, o.id DESC LIMIT ?`,
      )
      .all(limit)
      .map((r) => ({
        id: num(r.id),
        number: str(r.number),
        status: str(r.status) as OrderStatus,
        entryDate: str(r.entry_date),
        expectedFinish: strOrNullSafe(r.expected_finish),
        totalCents: num(r.total_cents),
        paidCents: num(r.paid_cents),
        financialStatus: str(r.financial_status) as "PENDENTE" | "PARCIAL" | "PAGO",
        clientName: str(r.client_name),
        vehiclePlate: str(r.vehicle_plate),
        vehicleLabel: [r.vehicle_brand, r.vehicle_model].filter(Boolean).join(" "),
      }));
  },
};

function strOrNullSafe(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}
