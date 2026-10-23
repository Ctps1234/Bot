import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  ORDER_STATUSES,
  STATUS_FLOW,
  type Order,
  type OrderStatus,
  type WorkshopSettings,
} from "../src/lib/types";
import { deriveFinancialStatus, statusTimestampPatch } from "../src/server/db/orders";
import { agingBucketFor } from "../src/server/db/stats";
import { DEFAULT_SETTINGS, SAMPLE_IDENTITY, identityGaps } from "../src/server/db/settings";

const MOMENT = "2026-10-01T10:00:00.000Z";

/** OS mínima para exercitar statusTimestampPatch sem tocar no banco. */
function orderWith(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    number: "OS-0001",
    clientId: 1,
    vehicleId: 1,
    status: "ABERTA",
    entryDate: "2026-10-01",
    expectedFinish: null,
    finishedAt: null,
    deliveredAt: null,
    canceledAt: null,
    mileageIn: null,
    fuelLevel: null,
    reportedIssue: "",
    diagnosis: "",
    notes: "",
    warrantyMonths: 3,
    technicianId: null,
    discountCents: 0,
    itemsTotalCents: 0,
    totalCents: 0,
    paidCents: 0,
    financialStatus: "PENDENTE",
    createdBy: 1,
    createdAt: MOMENT,
    updatedAt: MOMENT,
    ...overrides,
  };
}

/** Configurações mínimas para exercitar identityGaps. */
function settingsWith(overrides: Partial<WorkshopSettings> = {}): WorkshopSettings {
  return {
    workshopName: SAMPLE_IDENTITY.workshopName,
    legalName: SAMPLE_IDENTITY.legalName,
    document: SAMPLE_IDENTITY.document,
    phone: SAMPLE_IDENTITY.phone,
    address: SAMPLE_IDENTITY.address,
    city: SAMPLE_IDENTITY.city,
    state: SAMPLE_IDENTITY.state,
    defaultWarrantyMonths: 3,
    defaultLaborHourCents: 12000,
    orderSeq: 1,
    printFooter: "",
    ...overrides,
  };
}

describe("fluxo de status da OS", () => {
  test("segue a ordem simples, sem etapa de aprovação", () => {
    assert.deepEqual(STATUS_FLOW.ABERTA, ["EM_EXECUCAO", "CANCELADA"]);
    assert.deepEqual(STATUS_FLOW.EM_EXECUCAO, ["CONCLUIDA", "ABERTA", "CANCELADA"]);
    assert.deepEqual(STATUS_FLOW.CONCLUIDA, ["ENTREGUE", "EM_EXECUCAO", "CANCELADA"]);
  });

  test("não permite pular etapas", () => {
    // Regressão verificada na API com 400: EM_EXECUCAO → ENTREGUE é inválido.
    assert.ok(!STATUS_FLOW.ABERTA.includes("CONCLUIDA"));
    assert.ok(!STATUS_FLOW.ABERTA.includes("ENTREGUE"));
    assert.ok(!STATUS_FLOW.EM_EXECUCAO.includes("ENTREGUE"));
  });

  test("ENTREGUE só retrocede para CONCLUIDA e CANCELADA só reabre", () => {
    assert.deepEqual(STATUS_FLOW.ENTREGUE, ["CONCLUIDA"]);
    assert.deepEqual(STATUS_FLOW.CANCELADA, ["ABERTA"]);
  });

  test("todo status tem saída definida e nenhum aponta para si mesmo", () => {
    for (const status of ORDER_STATUSES) {
      const next = STATUS_FLOW[status];
      assert.ok(Array.isArray(next), `faltou fluxo para ${status}`);
      assert.ok(!next.includes(status), `${status} não deveria permitir transição para si mesmo`);
    }
  });

  test("todo destino é um status válido", () => {
    for (const [from, targets] of Object.entries(STATUS_FLOW)) {
      for (const target of targets) {
        assert.ok(
          (ORDER_STATUSES as readonly OrderStatus[]).includes(target),
          `${from} aponta para destino inválido: ${target}`,
        );
      }
    }
  });
});

describe("status financeiro derivado", () => {
  test("sem pagamento é PENDENTE", () => {
    assert.equal(deriveFinancialStatus(10000, 0), "PENDENTE");
  });

  test("estorno além do zero volta para PENDENTE", () => {
    assert.equal(deriveFinancialStatus(10000, -500), "PENDENTE");
  });

  test("qualquer valor entre zero e o total é PARCIAL", () => {
    assert.equal(deriveFinancialStatus(10000, 1), "PARCIAL");
    assert.equal(deriveFinancialStatus(10000, 5000), "PARCIAL");
    assert.equal(deriveFinancialStatus(10000, 9999), "PARCIAL");
  });

  test("total pago ou excedente é PAGO", () => {
    assert.equal(deriveFinancialStatus(10000, 10000), "PAGO");
    assert.equal(deriveFinancialStatus(10000, 10001), "PAGO");
  });

  test("OS ainda sem itens fica PENDENTE", () => {
    // Nada foi faturado, então segue "Em aberto" — não "Pago".
    assert.equal(deriveFinancialStatus(0, 0), "PENDENTE");
  });
});

describe("marcos de data por status", () => {
  test("CONCLUIDA marca finishedAt e limpa os posteriores", () => {
    const patch = statusTimestampPatch("CONCLUIDA", orderWith());
    assert.ok(patch.finishedAt, "deveria marcar finishedAt");
    assert.equal(patch.deliveredAt, null);
    assert.equal(patch.canceledAt, null);
  });

  test("ENTREGUE marca finishedAt e deliveredAt quando ambos faltam", () => {
    const patch = statusTimestampPatch("ENTREGUE", orderWith());
    assert.ok(patch.finishedAt);
    assert.ok(patch.deliveredAt);
  });

  test("ENTREGUE não sobrescreve finishedAt já existente", () => {
    const patch = statusTimestampPatch("ENTREGUE", orderWith({ finishedAt: MOMENT }));
    assert.equal(patch.finishedAt, undefined, "não deveria remarcar a conclusão");
    assert.ok(patch.deliveredAt, "deveria marcar a entrega");
  });

  test("CANCELADA marca canceledAt uma única vez", () => {
    assert.ok(statusTimestampPatch("CANCELADA", orderWith()).canceledAt);
    assert.equal(
      statusTimestampPatch("CANCELADA", orderWith({ canceledAt: MOMENT })).canceledAt,
      undefined,
      "não deveria remarcar o cancelamento",
    );
  });

  test("voltar para ABERTA limpa todos os marcos", () => {
    const patch = statusTimestampPatch(
      "ABERTA",
      orderWith({ finishedAt: MOMENT, deliveredAt: MOMENT, canceledAt: MOMENT }),
    );
    assert.equal(patch.finishedAt, null);
    assert.equal(patch.deliveredAt, null);
    assert.equal(patch.canceledAt, null);
  });

  test("voltar para EM_EXECUCAO limpa conclusão, entrega e cancelamento", () => {
    const patch = statusTimestampPatch(
      "EM_EXECUCAO",
      orderWith({ finishedAt: MOMENT, deliveredAt: MOMENT, canceledAt: MOMENT }),
    );
    assert.equal(patch.finishedAt, null, "conclusão deveria ser limpa");
    assert.equal(patch.deliveredAt, null);
    assert.equal(patch.canceledAt, null);
  });

  test("EM_EXECUCAO não inventa marco quando não havia nenhum", () => {
    const patch = statusTimestampPatch("EM_EXECUCAO", orderWith());
    assert.equal(patch.finishedAt, undefined, "não havia conclusão a limpar");
    assert.equal(patch.deliveredAt, null);
    assert.equal(patch.canceledAt, null);
  });
});

describe("faixas de atraso do aging", () => {
  test("sem vencimento é receita em andamento, não atraso", () => {
    assert.equal(agingBucketFor(null), "NAO_ENTREGUE");
  });

  test("limites exatos de cada faixa", () => {
    assert.equal(agingBucketFor(0), "ATE_7");
    assert.equal(agingBucketFor(7), "ATE_7");
    assert.equal(agingBucketFor(8), "DE_8_A_30");
    assert.equal(agingBucketFor(30), "DE_8_A_30");
    assert.equal(agingBucketFor(31), "DE_31_A_60");
    assert.equal(agingBucketFor(60), "DE_31_A_60");
    assert.equal(agingBucketFor(61), "ACIMA_60");
    assert.equal(agingBucketFor(365), "ACIMA_60");
  });
});

describe("detecção de configuração pendente", () => {
  test("dados de exemplo do seed apontam os quatro campos", () => {
    assert.deepEqual(identityGaps(settingsWith()), [
      "nome da oficina",
      "CNPJ",
      "telefone",
      "endereço",
    ]);
  });

  test("oficina configurada não gera aviso", () => {
    assert.deepEqual(
      identityGaps(
        settingsWith({
          workshopName: "Auto Elétrica Silva & Filhos",
          document: "12.999.888/0001-77",
          phone: "(21) 98888-7777",
          address: "Rua Uruguaiana, 100 — Centro",
        }),
      ),
      [],
    );
  });

  test("campo vazio conta como pendente", () => {
    assert.deepEqual(
      identityGaps(settingsWith({ workshopName: "Oficina Real", document: "", phone: "", address: "Rua A, 1" })),
      ["CNPJ", "telefone"],
    );
  });

  test("campo só com espaços em branco conta como vazio", () => {
    const gaps = identityGaps(
      settingsWith({ workshopName: "Oficina Real", document: "   ", phone: "(21) 1", address: "Rua A" }),
    );
    assert.ok(gaps.includes("CNPJ"), `esperado CNPJ pendente, veio ${JSON.stringify(gaps)}`);
    assert.ok(!gaps.includes("telefone"), "telefone preenchido não deveria ser apontado");
  });

  test("nome padrão do código também é tratado como exemplo", () => {
    assert.deepEqual(
      identityGaps(
        settingsWith({
          workshopName: DEFAULT_SETTINGS.workshopName,
          document: "12.999.888/0001-77",
          phone: "(21) 1",
          address: "Rua A",
        }),
      ),
      ["nome da oficina"],
    );
  });
});
