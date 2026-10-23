/** Tipos e constantes de domínio. */

export const ROLES = ["ADMIN", "GESTOR", "TECNICO", "RECEPCAO"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico",
  RECEPCAO: "Recepção",
};

export const ORDER_STATUSES = [
  "ABERTA",
  "EM_EXECUCAO",
  "CONCLUIDA",
  "ENTREGUE",
  "CANCELADA",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABEL: Record<OrderStatus, string> = {
  ABERTA: "Aberta",
  EM_EXECUCAO: "Em execução",
  CONCLUIDA: "Concluída",
  ENTREGUE: "Entregue",
  CANCELADA: "Cancelada",
};

/** Cores (tokens do tema) por status — usadas em badges e kanban. */
export const STATUS_TONE: Record<
  OrderStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  ABERTA: "info",
  EM_EXECUCAO: "warning",
  CONCLUIDA: "success",
  ENTREGUE: "neutral",
  CANCELADA: "danger",
};

/** Fluxo simples: para onde cada status pode avançar. */
export const STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  ABERTA: ["EM_EXECUCAO", "CANCELADA"],
  EM_EXECUCAO: ["CONCLUIDA", "ABERTA", "CANCELADA"],
  CONCLUIDA: ["ENTREGUE", "EM_EXECUCAO", "CANCELADA"],
  ENTREGUE: ["CONCLUIDA"],
  CANCELADA: ["ABERTA"],
};

export const NEXT_ACTION_LABEL: Partial<Record<OrderStatus, string>> = {
  ABERTA: "Iniciar serviço",
  EM_EXECUCAO: "Concluir serviço",
  CONCLUIDA: "Registrar entrega",
};

export const FINANCIAL_STATUSES = ["PENDENTE", "PARCIAL", "PAGO"] as const;
export type FinancialStatus = (typeof FINANCIAL_STATUSES)[number];

export const FIN_LABEL: Record<FinancialStatus, string> = {
  PENDENTE: "Em aberto",
  PARCIAL: "Parcial",
  PAGO: "Pago",
};

export const FIN_TONE: Record<
  FinancialStatus,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  PENDENTE: "danger",
  PARCIAL: "warning",
  PAGO: "success",
};

export const PAYMENT_METHODS = [
  "DINHEIRO",
  "PIX",
  "DEBITO",
  "CREDITO",
  "TRANSFERENCIA",
  "BOLETO",
  "OUTRO",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  DEBITO: "Cartão de débito",
  CREDITO: "Cartão de crédito",
  TRANSFERENCIA: "Transferência",
  BOLETO: "Boleto",
  OUTRO: "Outro",
};

export const ITEM_KINDS = ["PECA", "SERVICO"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ITEM_KIND_LABEL: Record<ItemKind, string> = {
  PECA: "Peça",
  SERVICO: "Serviço (mão de obra)",
};

export const VOLTAGES = ["12V", "24V", "12V/24V", "OUTRO"] as const;
export type Voltage = (typeof VOLTAGES)[number];

export const PERSON_TYPES = ["FISICA", "JURIDICA"] as const;
export type PersonType = (typeof PERSON_TYPES)[number];

export const PERSON_TYPE_LABEL: Record<PersonType, string> = {
  FISICA: "Pessoa física",
  JURIDICA: "Pessoa jurídica",
};

/* ---------------------------------- tipos --------------------------------- */

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: number;
  name: string;
  personType: PersonType;
  document: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Vehicle {
  id: number;
  clientId: number;
  plate: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  voltage: Voltage;
  fleetNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface OrderItem {
  id: number;
  orderId: number;
  kind: ItemKind;
  description: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  warrantyMonths: number;
  notes: string | null;
  sort: number;
  createdAt: string;
}

export interface Payment {
  id: number;
  orderId: number;
  method: PaymentMethod;
  amountCents: number;
  paidAt: string;
  note: string | null;
  createdBy: number | null;
  createdAt: string;
}

export interface Order {
  id: number;
  number: string;
  clientId: number;
  vehicleId: number;
  status: OrderStatus;
  entryDate: string;
  expectedFinish: string | null;
  finishedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  mileageIn: number | null;
  fuelLevel: number | null;
  reportedIssue: string;
  diagnosis: string;
  notes: string;
  warrantyMonths: number;
  technicianId: number | null;
  discountCents: number;
  itemsTotalCents: number;
  totalCents: number;
  paidCents: number;
  financialStatus: FinancialStatus;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Order + relacionamentos usados nas listagens e na tela de detalhe. */
export interface OrderWithRelations extends Order {
  client: Client;
  vehicle: Vehicle;
  technician: Pick<User, "id" | "name"> | null;
  items: OrderItem[];
  payments: Payment[];
  balanceCents: number;
}

export interface WorkshopSettings {
  workshopName: string;
  legalName: string;
  document: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  defaultWarrantyMonths: number;
  defaultLaborHourCents: number;
  orderSeq: number;
  printFooter: string;
}

export interface DashboardData {
  kpis: {
    openOrders: number;
    runningOrders: number;
    finishedOrders: number;
    deliveredThisMonth: number;
    monthRevenueCents: number;
    monthOrders: number;
    receivableCents: number;
    avgTicketCents: number;
    overdueOrders: number;
    vehiclesToday: number;
  };
  recentOrders: OrderWithRelations[];
  statusBreakdown: { status: OrderStatus; count: number }[];
  topServices: { description: string; total: number; revenueCents: number }[];
  revenueByMethod: { method: PaymentMethod; totalCents: number }[];
}
