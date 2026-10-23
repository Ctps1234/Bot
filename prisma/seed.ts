/**
 * Carga inicial do banco.
 *
 * - Cria a estrutura (migrations)
 * - Cria os dados da oficina (configurações) e o usuário administrador
 * - Popula dados de demonstração (clientes, veículos, OS, itens e pagamentos)
 *   para o sistema já abrir com conteúdo realista.
 *
 * Uso:
 *   npm run db:seed          -> cria admin + demo (não apaga nada existente)
 *   npm run db:seed -- --fresh -> apaga o banco e recria tudo do zero
 *   npm run db:seed -- --no-demo -> cria apenas admin e configurações
 */

import fs from "node:fs";
import path from "node:path";
import { ensureDb, getDb, migrate, resolveDbPath } from "../src/server/db/index";
import { settingsRepo } from "../src/server/db/settings";
import { usersRepo } from "../src/server/db/users";
import { clientsRepo } from "../src/server/db/clients";
import { ordersRepo } from "../src/server/db/orders";
import type { ItemKind, OrderStatus, PaymentMethod, Role, Voltage } from "../src/lib/types";
import { normalizePlate, toISODate } from "../src/lib/utils";

const args = process.argv.slice(2);
const FRESH = args.includes("--fresh");
const NO_DEMO = args.includes("--no-demo");

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@oficina.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin123";
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? "Carlos Andrade";
const WORKSHOP_NAME = process.env.SEED_WORKSHOP_NAME ?? "Auto Elétrica Andrade";

/* ------------------------------- utilidades -------------------------------- */

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toISODate(d) as string;
}

function pick<T>(list: T[], seed: number): T {
  return list[seed % list.length];
}

/** PRNG simples e determinístico (mantém o seed reprodutível). */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/* --------------------------------- dados ---------------------------------- */

interface DemoClient {
  name: string;
  personType: "FISICA" | "JURIDICA";
  phone: string;
  email: string;
  document: string;
  address: string;
  notes?: string;
  vehicles: {
    plate: string;
    brand: string;
    model: string;
    year: number;
    color: string;
    voltage: Voltage;
    fleetNumber?: string;
    notes?: string;
  }[];
}

const DEMO_CLIENTS: DemoClient[] = [
  {
    name: "Marcos Vinícius Teixeira",
    personType: "FISICA",
    phone: "21988771201",
    email: "marcos.teixeira@gmail.com",
    document: "12345678909",
    address: "Rua Voluntários da Pátria, 220 — Botafogo, Rio de Janeiro/RJ",
    notes: "Prefere contato por WhatsApp. Cliente desde 2022.",
    vehicles: [
      {
        plate: "KMX4A21",
        brand: "Volkswagen",
        model: "Gol 1.6",
        year: 2013,
        color: "Prata",
        voltage: "12V",
        notes: "Bateria trocada em 2024 (60Ah). Alternador revisado.",
      },
    ],
  },
  {
    name: "Ana Paula Ribeiro",
    personType: "FISICA",
    phone: "21996554433",
    email: "anap.ribeiro@hotmail.com",
    document: "98765432100",
    address: "Av. das Américas, 3500 — Barra da Tijuca, Rio de Janeiro/RJ",
    vehicles: [
      {
        plate: "LRP7B88",
        brand: "Hyundai",
        model: "HB20 Comfort",
        year: 2019,
        color: "Branco",
        voltage: "12V",
      },
      {
        plate: "QDW2E14",
        brand: "Fiat",
        model: "Palio Fire",
        year: 2009,
        color: "Cinza",
        voltage: "12V",
        notes: "Carro do marido, usado para entregas.",
      },
    ],
  },
  {
    name: "TransLog Transportes LTDA",
    personType: "JURIDICA",
    phone: "2133445566",
    email: "manutencao@translog.com.br",
    document: "12345678000199",
    address: "Rod. Washington Luís, 4500 — Duque de Caxias/RJ",
    notes: "Frota de 12 veículos. Faturamento mensal, pagamento por transferência.",
    vehicles: [
      {
        plate: "FTL1D02",
        brand: "Fiat",
        model: "Fiorino Furgão",
        year: 2021,
        color: "Branco",
        voltage: "12V",
        fleetNumber: "02",
      },
      {
        plate: "FTL1D07",
        brand: "Fiat",
        model: "Fiorino Furgão",
        year: 2021,
        color: "Branco",
        voltage: "12V",
        fleetNumber: "07",
      },
      {
        plate: "RJK9C45",
        brand: "Mercedes-Benz",
        model: "Sprinter 415",
        year: 2018,
        color: "Prata",
        voltage: "24V",
        fleetNumber: "11",
        notes: "Sistema 24V — duas baterias em série.",
      },
    ],
  },
  {
    name: "João Batista Ferreira",
    personType: "FISICA",
    phone: "21981223344",
    email: "",
    document: "45678912300",
    address: "Rua São João, 88 — Centro, Niterói/RJ",
    notes: "Taxista. Passa na oficina com frequência.",
    vehicles: [
      {
        plate: "TAX0F55",
        brand: "Chevrolet",
        model: "Spin LTZ",
        year: 2017,
        color: "Preto",
        voltage: "12V",
        notes: "Uso intenso (táxi). Bateria dura ~14 meses.",
      },
    ],
  },
  {
    name: "Fernanda Costa Lima",
    personType: "FISICA",
    phone: "21977118899",
    email: "fer.costalima@gmail.com",
    document: "32165498700",
    address: "Rua Conde de Bonfim, 700 — Tijuca, Rio de Janeiro/RJ",
    vehicles: [
      {
        plate: "NVC3G09",
        brand: "Renault",
        model: "Sandero Zen",
        year: 2020,
        color: "Vermelho",
        voltage: "12V",
      },
    ],
  },
  {
    name: "Pedro Henrique Alves",
    personType: "FISICA",
    phone: "21964007788",
    email: "ph.alves@outlook.com",
    document: "65498732100",
    address: "Estrada do Galeão, 1200 — Ilha do Governador, Rio de Janeiro/RJ",
    vehicles: [
      {
        plate: "JHF8K33",
        brand: "Ford",
        model: "Ka SE",
        year: 2016,
        color: "Azul",
        voltage: "12V",
      },
      {
        plate: "ZPB5L71",
        brand: "Toyota",
        model: "Corolla XEi",
        year: 2022,
        color: "Prata",
        voltage: "12V",
        notes: "Carro da esposa.",
      },
    ],
  },
  {
    name: "Oficina Mecânica Bom Jesus",
    personType: "JURIDICA",
    phone: "2132227788",
    email: "contato@bomjesusmecanica.com.br",
    document: "98765432000188",
    address: "Rua Bom Jesus, 45 — Méier, Rio de Janeiro/RJ",
    notes: "Parceiro: encaminha serviços elétricos. Cobra-se valor de repasse.",
    vehicles: [
      {
        plate: "BJM2H18",
        brand: "Chevrolet",
        model: "Onix LT",
        year: 2018,
        color: "Branco",
        voltage: "12V",
        notes: "Veículo de cliente repassado pela oficina parceira.",
      },
    ],
  },
  {
    name: "Ricardo Nogueira Santana",
    personType: "FISICA",
    phone: "21990887766",
    email: "",
    document: "78912345600",
    address: "Av. Brasil, 22000 — Campo Grande, Rio de Janeiro/RJ",
    vehicles: [
      {
        plate: "GTR6M24",
        brand: "Jeep",
        model: "Renegade Sport",
        year: 2021,
        color: "Cinza",
        voltage: "12V",
      },
    ],
  },
];

interface ServiceTemplate {
  reportedIssue: string;
  diagnosis: string;
  items: {
    kind: ItemKind;
    description: string;
    quantity: number;
    unitPriceCents: number;
    warrantyMonths?: number;
  }[];
}

const SERVICE_TEMPLATES: ServiceTemplate[] = [
  {
    reportedIssue:
      "Carro não dá partida pela manhã. Faz um “tec tec” e as luzes do painel enfraquecem. Já precisou de chupeta duas vezes esta semana.",
    diagnosis:
      "Teste de bateria com analisador: tensão de 11,4V em repouso e queda para 8,9V durante a partida. Bateria com célula em curto, fora de condição de uso. Alternador carregando normalmente (14,1V a 2000 rpm). Motor de partida sem sinais de desgaste.",
    items: [
      { kind: "PECA", description: "Bateria 60Ah — Moura", quantity: 1, unitPriceCents: 64990, warrantyMonths: 18 },
      { kind: "SERVICO", description: "Troca de bateria + teste de carga", quantity: 1, unitPriceCents: 8000, warrantyMonths: 3 },
    ],
  },
  {
    reportedIssue:
      "Luz da bateria acendeu no painel durante a chuva e o carro começou a descarregar. Farol ficou fraco à noite.",
    diagnosis:
      "Alternador medido em 12,3V com motor em 2500 rpm (esperado 13,8–14,4V). Regulador de tensão danificado e escovas gastas. Fiação do chicote sem oxidação. Recomendado reparo do alternador em vez de troca da peça completa.",
    items: [
      { kind: "PECA", description: "Regulador de tensão — Bosch", quantity: 1, unitPriceCents: 28900, warrantyMonths: 12 },
      { kind: "PECA", description: "Jogo de escovas do alternador", quantity: 1, unitPriceCents: 6500, warrantyMonths: 6 },
      { kind: "SERVICO", description: "Reparo do alternador (desmontagem, limpeza e teste em bancada)", quantity: 1, unitPriceCents: 32000, warrantyMonths: 6 },
    ],
  },
  {
    reportedIssue:
      "Motor de partida faz barulho alto e às vezes não engata. Precisa insistir duas ou três vezes para o carro pegar.",
    diagnosis:
      "Motor de partida com solenoide desgastado e buchas com folga. Consumo de corrente acima do especificado (380A em partida). Realizada retífica: substituição de solenoide, buchas e bendix.",
    items: [
      { kind: "PECA", description: "Solenoide do motor de partida", quantity: 1, unitPriceCents: 15900, warrantyMonths: 12 },
      { kind: "PECA", description: "Kit de buchas e bendix", quantity: 1, unitPriceCents: 9800, warrantyMonths: 6 },
      { kind: "SERVICO", description: "Retífica do motor de partida", quantity: 1, unitPriceCents: 26000, warrantyMonths: 6 },
    ],
  },
  {
    reportedIssue:
      "Vidro elétrico da porta dianteira direita desceu e não subiu mais. Ouvimos um estalo antes de parar.",
    diagnosis:
      "Máquina do vidro elétrico com cabo de aço rompido e trilho empenado. Motor do vidro em bom estado (testado fora da máquina). Realizada substituição da máquina e lubrificação do trilho.",
    items: [
      { kind: "PECA", description: "Máquina do vidro elétrico dianteira direita", quantity: 1, unitPriceCents: 34990, warrantyMonths: 12 },
      { kind: "SERVICO", description: "Substituição da máquina do vidro + regulagem", quantity: 1, unitPriceCents: 18000, warrantyMonths: 3 },
    ],
  },
  {
    reportedIssue:
      "Luz de injeção (check engine) acesa no painel há três dias. Consumo de combustível aumentou e o carro dá pequenos solavancos em marcha lenta.",
    diagnosis:
      "Leitura de scanner: código P0300 (falha de ignição múltipla) e P0171 (mistura pobre). Bobina de ignição do cilindro 2 com isolamento rompido. Velas com desgaste além do limite. Troca da bobina e das quatro velas, apagamento dos códigos e teste de rodagem de 8 km sem reincidência.",
    items: [
      { kind: "PECA", description: "Bobina de ignição", quantity: 1, unitPriceCents: 42900, warrantyMonths: 12 },
      { kind: "PECA", description: "Jogo de velas de ignição (4 un.)", quantity: 1, unitPriceCents: 13600, warrantyMonths: 12 },
      { kind: "SERVICO", description: "Diagnóstico eletrônico com scanner", quantity: 1, unitPriceCents: 15000, warrantyMonths: 0 },
      { kind: "SERVICO", description: "Substituição de bobina e velas", quantity: 1, unitPriceCents: 14000, warrantyMonths: 6 },
    ],
  },
  {
    reportedIssue:
      "Trava elétrica dispara sozinha e o alarme arma sem motivo. Porta-malas não abre pelo controle.",
    diagnosis:
      "Chicote da porta do motorista com fios partidos na sanfona (ponto de dobra), causando curto intermitente entre os circuitos de trava e alarme. Reparo do chicote com ressolda e novo isolamento; atuador da tampa do porta-malas substituído.",
    items: [
      { kind: "PECA", description: "Atuador da trava da tampa traseira", quantity: 1, unitPriceCents: 18500, warrantyMonths: 12 },
      { kind: "SERVICO", description: "Reparo de chicote elétrico da porta", quantity: 1, unitPriceCents: 28000, warrantyMonths: 6 },
      { kind: "SERVICO", description: "Reprogramação do módulo de alarme", quantity: 1, unitPriceCents: 9000, warrantyMonths: 3 },
    ],
  },
  {
    reportedIssue:
      "Ar-condicionado não gela. Ventilador interno só funciona na velocidade máxima.",
    diagnosis:
      "Resistor do ventilador (módulo de velocidade) em curto aberto e pressostato de baixa com leitura fora de faixa. Carga de gás dentro do normal após teste com manifold. Substituição do resistor e do pressostato, teste de desempenho: saída a 6 °C.",
    items: [
      { kind: "PECA", description: "Resistor do ventilador interno", quantity: 1, unitPriceCents: 21900, warrantyMonths: 12 },
      { kind: "PECA", description: "Pressostato de baixa pressão", quantity: 1, unitPriceCents: 16800, warrantyMonths: 12 },
      { kind: "SERVICO", description: "Reparo elétrico do sistema de ar-condicionado", quantity: 1, unitPriceCents: 26000, warrantyMonths: 6 },
    ],
  },
  {
    reportedIssue:
      "Farol direito não acende e a luz de posição do mesmo lado pisca fraco. Cliente relata que já trocou a lâmpada duas vezes.",
    diagnosis:
      "Aterramento do farol direito oxidado e conector derretido por mau contato (resistência alta). Lâmpadas substituídas anteriormente queimaram por sobreaquecimento. Limpeza do ponto de terra, substituição do conector e reforço do aterramento com novo cabo.",
    items: [
      { kind: "PECA", description: "Conector de farol cerâmico + terminais", quantity: 1, unitPriceCents: 7400, warrantyMonths: 12 },
      { kind: "PECA", description: "Lâmpada halógena H4 (par)", quantity: 1, unitPriceCents: 8900, warrantyMonths: 6 },
      { kind: "SERVICO", description: "Reparo de aterramento e do chicote do farol", quantity: 1, unitPriceCents: 19000, warrantyMonths: 6 },
    ],
  },
  {
    reportedIssue:
      "Instalação de som: cliente trouxe módulo e alto-falantes novos. Pede também câmera de ré.",
    diagnosis:
      "Instalação de módulo amplificador com cabeamento dimensionado (4 AWG), fusível de linha, dutos e acabamento. Câmera de ré instalada no para-choque com acionamento pela luz de ré e passagem do chicote pela coluna traseira. Teste de funcionamento e ajuste de ganho.",
    items: [
      { kind: "PECA", description: "Kit de cabeamento para módulo (4 AWG)", quantity: 1, unitPriceCents: 19900, warrantyMonths: 12 },
      { kind: "PECA", description: "Câmera de ré universal", quantity: 1, unitPriceCents: 14900, warrantyMonths: 12 },
      { kind: "SERVICO", description: "Instalação de som e câmera de ré", quantity: 1, unitPriceCents: 45000, warrantyMonths: 6 },
    ],
  },
  {
    reportedIssue:
      "Bateria descarrega com o carro parado na garagem por dois dias. Já aconteceu três vezes este mês.",
    diagnosis:
      "Teste de corrente de fuga: 620 mA (limite de referência 50 mA). Isolamento por seções apontou fuga no módulo de rastreador instalado por terceiros, fora de especificação. Refeito o aterramento do rastreador e adicionado relé de corte; corrente de fuga caiu para 28 mA.",
    items: [
      { kind: "PECA", description: "Relé auxiliar 12V 40A + porta-fusível", quantity: 1, unitPriceCents: 5600, warrantyMonths: 12 },
      { kind: "SERVICO", description: "Diagnóstico de corrente de fuga (parasita)", quantity: 1, unitPriceCents: 22000, warrantyMonths: 3 },
      { kind: "SERVICO", description: "Correção de instalação de rastreador", quantity: 1, unitPriceCents: 18000, warrantyMonths: 6 },
    ],
  },
];

const PAYMENT_MIX: PaymentMethod[] = ["PIX", "DINHEIRO", "CREDITO", "DEBITO", "TRANSFERENCIA"];

/* ---------------------------------- seed ---------------------------------- */

function resetDatabase() {
  const dbPath = resolveDbPath();
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = `${dbPath}${suffix}`;
    if (fs.existsSync(file)) {
      fs.rmSync(file);
      console.log(`  · removido ${path.relative(process.cwd(), file)}`);
    }
  }
}

function seedBase() {
  console.log("→ Configurações da oficina…");
  settingsRepo.update({
    workshopName: WORKSHOP_NAME,
    legalName: `${WORKSHOP_NAME} ME`,
    document: "34.567.890/0001-12",
    phone: "(21) 3322-4455",
    address: "Rua Visconde de Santa Isabel, 340 — Vila Isabel",
    city: "Rio de Janeiro",
    state: "RJ",
    defaultWarrantyMonths: 3,
    defaultLaborHourCents: 12000,
    printFooter:
      "Garantia de 3 meses sobre serviços executados e conforme fabricante para peças. " +
      "Veículos não retirados em até 30 dias após o aviso estarão sujeitos a taxa de pátio.",
  });

  console.log("→ Usuários…");
  const roles: { name: string; email: string; password: string; role: Role; phone: string }[] = [
    { name: ADMIN_NAME, email: ADMIN_EMAIL, password: ADMIN_PASSWORD, role: "ADMIN", phone: "21999990001" },
    { name: "Sônia Marques", email: "sonia@oficina.com", password: "sonia123", role: "RECEPCAO", phone: "21999990002" },
    { name: "Diego Farias", email: "diego@oficina.com", password: "diego123", role: "TECNICO", phone: "21999990003" },
    { name: "Rogério Pinto", email: "rogerio@oficina.com", password: "rogerio123", role: "TECNICO", phone: "21999990004" },
    { name: "Elisa Duarte", email: "elisa@oficina.com", password: "elisa123", role: "GESTOR", phone: "21999990005" },
  ];

  for (const r of roles) {
    if (usersRepo.findByEmail(r.email)) continue;
    usersRepo.create(r);
  }
  console.log(`  · ${usersRepo.count()} usuário(s) criados`);
}

function seedDemo() {
  const db = getDb();
  const random = rng(20261022);

  const existingOrders = Number(
    db.prepare("SELECT COUNT(*) AS c FROM orders").get()?.c ?? 0,
  );
  if (existingOrders > 0) {
    console.log(`→ Demo: já existem ${existingOrders} OS no banco, pulando carga de demonstração.`);
    return;
  }

  console.log("→ Clientes e veículos…");
  const admin = usersRepo.findByEmail(ADMIN_EMAIL)!;
  const technicians = usersRepo.listTechnicians().filter((t) => t.id !== admin.id);
  const createdClients: { id: number; vehicles: { id: number; plate: string }[] }[] = [];

  for (const data of DEMO_CLIENTS) {
    const client = clientsRepo.create({
      name: data.name,
      personType: data.personType,
      phone: data.phone,
      email: data.email || null,
      document: data.document,
      address: data.address,
      notes: data.notes ?? null,
    });
    const vehicles = data.vehicles.map((v) => {
      const vehicle = clientsRepo.createVehicle({
        clientId: client.id,
        plate: normalizePlate(v.plate),
        brand: v.brand,
        model: v.model,
        year: v.year,
        color: v.color,
        voltage: v.voltage,
        fleetNumber: v.fleetNumber ?? null,
        notes: v.notes ?? null,
      });
      return { id: vehicle.id, plate: vehicle.plate };
    });
    createdClients.push({ id: client.id, vehicles });
  }
  console.log(`  · ${createdClients.length} clientes, ${createdClients.reduce((s, c) => s + c.vehicles.length, 0)} veículos`);

  console.log("→ Ordens de serviço…");
  let created = 0;
  const totalOrders = 34;

  for (let i = 0; i < totalOrders; i += 1) {
    const clientRef = createdClients[Math.floor(random() * createdClients.length)];
    const vehicleRef = clientRef.vehicles[Math.floor(random() * clientRef.vehicles.length)];
    const template = SERVICE_TEMPLATES[Math.floor(random() * SERVICE_TEMPLATES.length)];

    // distribuição no tempo: 60% nos últimos 30 dias, resto nos 120 dias anteriores
    const recent = random() < 0.6;
    const age = recent ? Math.floor(random() * 30) : 30 + Math.floor(random() * 90);

    // status conforme a idade da OS
    let status: OrderStatus;
    if (age <= 1) status = random() < 0.6 ? "ABERTA" : "EM_EXECUCAO";
    else if (age <= 3) status = random() < 0.5 ? "EM_EXECUCAO" : "CONCLUIDA";
    else if (age <= 8) status = random() < 0.7 ? "ENTREGUE" : "CONCLUIDA";
    else status = random() < 0.94 ? "ENTREGUE" : "CANCELADA";

    const mileage = 20000 + Math.floor(random() * 180000);
    const technician = technicians.length
      ? technicians[Math.floor(random() * technicians.length)]
      : admin;

    const order = ordersRepo.create({
      clientId: clientRef.id,
      vehicleId: vehicleRef.id,
      entryDate: daysAgo(age),
      expectedFinish: daysAgo(Math.max(0, age - (1 + Math.floor(random() * 2)))),
      mileageIn: mileage,
      fuelLevel: [100, 75, 50, 25, 12][Math.floor(random() * 5)],
      reportedIssue: template.reportedIssue,
      diagnosis: status === "ABERTA" ? "" : template.diagnosis,
      notes: "",
      warrantyMonths: 3,
      technicianId: technician.id,
      discountCents: 0,
      createdBy: admin.id,
    });

    ordersRepo.addItems(
      order.id,
      template.items.map((item) => ({
        kind: item.kind,
        description: item.description,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        warrantyMonths: item.warrantyMonths ?? 0,
        notes: null,
      })),
    );

    // aplica o status (com timestamps coerentes)
    if (status !== "ABERTA") {
      ordersRepo.setStatus(order.id, "EM_EXECUCAO");
      if (status === "CONCLUIDA" || status === "ENTREGUE") ordersRepo.setStatus(order.id, "CONCLUIDA");
      if (status === "ENTREGUE") ordersRepo.setStatus(order.id, "ENTREGUE");
      if (status === "CANCELADA") ordersRepo.cancel(order.id, "Cliente desistiu do serviço");
    }

    // pagamentos
    const current = ordersRepo.findById(order.id)!;
    if (status === "ENTREGUE") {
      const method = pick(PAYMENT_MIX, Math.floor(random() * PAYMENT_MIX.length));
      // 20% das OS entregues ficam com uma parcela em aberto (para mostrar "Parcial")
      const partial = random() < 0.2;
      const first = partial
        ? Math.round(current.totalCents * 0.5)
        : current.totalCents;
      ordersRepo.addPayment({
        orderId: order.id,
        amountCents: Math.max(1, first),
        method,
        paidAt: daysAgo(age),
        createdBy: admin.id,
        note: null,
      });
      if (partial) {
        ordersRepo.addPayment({
          orderId: order.id,
          amountCents: Math.max(1, Math.round(current.totalCents * 0.3)),
          method: pick(PAYMENT_MIX, Math.floor(random() * 3)),
          paidAt: daysAgo(Math.max(0, age - 2)),
          createdBy: admin.id,
          note: "Segunda parcela combinada com o cliente",
        });
      }
    } else if (status === "CONCLUIDA" && random() < 0.35) {
      ordersRepo.addPayment({
        orderId: order.id,
        amountCents: Math.max(1, Math.round(current.totalCents * 0.4)),
        method: "PIX",
        paidAt: daysAgo(age),
        createdBy: admin.id,
        note: "Sinal combinado na aprovação do orçamento",
      });
    }

    created += 1;
  }

  const totals = db
    .prepare(
      `SELECT COUNT(*) AS orders,
              COALESCE(SUM(total_cents),0) AS revenue,
              COALESCE(SUM(paid_cents),0) AS received
         FROM orders WHERE status <> 'CANCELADA'`,
    )
    .get();

  console.log(
    `  · ${created} OS criadas · faturado ${formatBRL(Number(totals?.revenue ?? 0))} · recebido ${formatBRL(Number(totals?.received ?? 0))}`,
  );
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/* --------------------------------- runner --------------------------------- */

function main() {
  console.log(`\n${WORKSHOP_NAME} — carga inicial do banco\n`);

  if (FRESH) {
    console.log("→ --fresh: apagando banco existente…");
    resetDatabase();
  }

  console.log("→ Aplicando migrations…");
  const { applied } = migrate();
  console.log(applied.length ? `  · ${applied.join(", ")}` : "  · banco já atualizado");

  ensureDb();
  seedBase();

  if (NO_DEMO) {
    console.log("→ --no-demo: pulando dados de demonstração.");
  } else {
    seedDemo();
  }

  console.log("\n✓ Banco pronto.");
  console.log(`  Acesso: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  console.log("  (outros perfis: sonia@oficina.com, diego@oficina.com, rogerio@oficina.com, elisa@oficina.com — senha = primeiro nome + 123)\n");
}

try {
  main();
} catch (error) {
  console.error("\n✗ Falha na carga inicial:", error);
  process.exit(1);
}

