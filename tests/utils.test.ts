import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  daysSince,
  formatDate,
  formatDocument,
  formatMoney,
  formatMoneyPlain,
  formatPhone,
  normalizePlate,
  onlyDigits,
  relativeDay,
  toCents,
  toISODate,
  todayISO,
} from "../src/lib/utils";

describe("dinheiro em centavos", () => {
  test("toCents entende o formato brasileiro", () => {
    assert.equal(toCents("1.234,56"), 123456);
    assert.equal(toCents("0,50"), 50);
    assert.equal(toCents("1234,5"), 123450);
    assert.equal(toCents("R$ 2.500,00"), 250000);
    assert.equal(toCents("  89,90  "), 8990);
  });

  test("toCents aceita número e ponto decimal", () => {
    assert.equal(toCents(12.5), 1250);
    assert.equal(toCents("12.50"), 1250);
    assert.equal(toCents("0"), 0);
  });

  test("toCents devolve 0 para vazio ou inválido", () => {
    assert.equal(toCents(""), 0);
    assert.equal(toCents(null), 0);
    assert.equal(toCents(undefined), 0);
    assert.equal(toCents("abc"), 0);
    assert.equal(toCents("R$"), 0);
  });

  test("centavos inteiros evitam o erro clássico de float", () => {
    // 0.1 + 0.2 em ponto flutuante dá 0.30000000000000004; em centavos é exato.
    assert.equal(toCents("0,10") + toCents("0,20"), 30);
  });

  test("formatMoney produz moeda brasileira", () => {
    const out = formatMoney(123456);
    assert.ok(out.startsWith("R$"), `esperado começar com R$, veio ${JSON.stringify(out)}`);
    assert.ok(out.includes("1.234,56"), `esperado conter 1.234,56, veio ${JSON.stringify(out)}`);
  });

  test("formatMoney trata zero, null e undefined como R$ 0,00", () => {
    for (const value of [0, null, undefined]) {
      const out = formatMoney(value);
      assert.ok(out.startsWith("R$"), `esperado começar com R$, veio ${JSON.stringify(out)}`);
      assert.ok(out.includes("0,00"), `esperado conter 0,00, veio ${JSON.stringify(out)}`);
    }
  });

  test("ida e volta formatMoneyPlain → toCents preserva o valor", () => {
    for (const cents of [0, 1, 50, 99, 1234, 123456, 9999999]) {
      assert.equal(
        toCents(formatMoneyPlain(cents)),
        cents,
        `perda de precisão para ${cents} centavos`,
      );
    }
  });
});

describe("datas — invariantes ao fuso horário", () => {
  /*
   * Regressão: o JavaScript lê "2026-10-19" como meia-noite UTC. Em fuso de
   * deslocamento negativo (Brasil, UTC-3) isso fazia formatDate() devolver o dia
   * anterior e TODA data da aplicação aparecia adiantada.
   *
   * Estas asserções precisam valer em qualquer fuso — por isso a suíte também é
   * rodada em vários TZ via `npm run test:tz`.
   */
  test("data sem hora mantém o mesmo dia", () => {
    assert.equal(formatDate("2026-10-19"), "19/10/2026");
    assert.equal(formatDate("2026-10-01"), "01/10/2026");
    assert.equal(formatDate("2026-03-05"), "05/03/2026");
    assert.equal(formatDate("2026-01-01"), "01/01/2026");
    assert.equal(formatDate("2026-12-31"), "31/12/2026");
  });

  test("primeiro dia do mês não vaza para o mês anterior", () => {
    // Antes da correção, 2026-05-01 aparecia como 30/04/2026 em UTC-3.
    assert.equal(formatDate("2026-05-01"), "01/05/2026");
    assert.equal(toISODate("2026-05-01"), "2026-05-01");
  });

  test("toISODate preserva a data sem hora", () => {
    assert.equal(toISODate("2026-10-19"), "2026-10-19");
    assert.equal(toISODate("2026-01-01"), "2026-01-01");
  });

  test("formatDate e toISODate concordam sobre o dia", () => {
    for (const iso of ["2026-01-01", "2026-02-28", "2026-06-15", "2026-12-31"]) {
      const [year, month, day] = iso.split("-");
      assert.equal(formatDate(iso), `${day}/${month}/${year}`);
      assert.equal(toISODate(iso), iso);
    }
  });

  test("todayISO devolve data local no formato YYYY-MM-DD", () => {
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(daysSince(todayISO()), 0);
  });

  test("daysSince conta dias corridos e aceita valores vazios", () => {
    assert.equal(daysSince(null), null);
    assert.equal(daysSince(undefined), null);
    assert.equal(daysSince(""), null);
  });

  test("relativeDay descreve o dia de hoje", () => {
    assert.equal(relativeDay(todayISO()), "hoje");
    assert.equal(relativeDay(null), "—");
  });
});

describe("placa de veículo", () => {
  test("normaliza caixa, espaços e separadores", () => {
    assert.equal(normalizePlate("tst9e2e"), "TST9E2E");
    assert.equal(normalizePlate("ABC-1234"), "ABC1234");
    assert.equal(normalizePlate(" abc 1d23 "), "ABC1D23");
    assert.equal(normalizePlate("RIO2A18"), "RIO2A18");
  });

  test("limita a 8 caracteres", () => {
    assert.equal(normalizePlate("ABCDEFGH12345"), "ABCDEFGH");
  });

  test("a mesma placa em formatos diferentes colide", () => {
    // É o que garante o índice único vehicles_plate_alive funcionar.
    assert.equal(normalizePlate("rio-2a18"), normalizePlate("RIO2A18"));
    assert.equal(normalizePlate("rio 2a18"), normalizePlate("RIO2A18"));
  });
});

describe("telefone e documento", () => {
  test("formatPhone aplica máscara conforme o comprimento", () => {
    assert.equal(formatPhone("21996554433"), "(21) 99655-4433");
    assert.equal(formatPhone("2133445566"), "(21) 3344-5566");
    assert.equal(formatPhone(""), "");
    assert.equal(formatPhone(null), "");
  });

  test("formatPhone mantém entrada já formatada", () => {
    assert.equal(formatPhone("(21) 3322-4455"), "(21) 3322-4455");
  });

  test("formatDocument formata CPF e CNPJ", () => {
    assert.equal(formatDocument("12345678909"), "123.456.789-09");
    assert.equal(formatDocument("12345678000199", "JURIDICA"), "12.345.678/0001-99");
    assert.equal(formatDocument(""), "");
    assert.equal(formatDocument(null), "");
  });

  test("formatDocument devolve os dígitos quando o comprimento não bate", () => {
    assert.equal(formatDocument("123"), "123");
  });

  test("onlyDigits ignora pontuação", () => {
    assert.equal(onlyDigits("12.345.678/0001-99"), "12345678000199");
    assert.equal(onlyDigits("(21) 3322-4455"), "2133224455");
    assert.equal(onlyDigits(null), "");
  });
});
