/**
 * Runner de testes.
 *
 * Usa o test runner nativo do Node (`node:test`) com `tsx` como loader — não
 * adiciona nenhuma dependência ao projeto.
 *
 * Também silencia o aviso "SQLite is an experimental feature", já que importar
 * os repositórios carrega o driver `node:sqlite`.
 *
 * Uso:
 *   node scripts/run-tests.mjs            -> roda a suíte uma vez
 *   node scripts/run-tests.mjs --all-tz   -> roda em vários fusos horários
 *
 * A variante --all-tz existe por causa de um defeito real já corrigido: o
 * JavaScript lê data só-data ("2026-10-19") como meia-noite UTC, o que em fuso
 * negativo fazia toda data aparecer um dia antes. Rodar a mesma suíte em fusos
 * dos dois lados de Greenwich é o que impede esse tipo de bug de voltar.
 */

import { spawn } from "node:child_process";

const root = process.cwd();
const FLAG = "--disable-warning=ExperimentalWarning";

/** Fusos que cobrem deslocamento negativo, zero e positivo extremo. */
const TIMEZONES = [
  "America/Sao_Paulo", // fuso da oficina (UTC-3)
  "America/New_York", // UTC-5/-4
  "UTC", // referência
  "Europe/Lisbon", // UTC+0/+1
  "Asia/Tokyo", // UTC+9
  "Pacific/Kiritimati", // UTC+14 (extremo positivo)
];

function runOnce(tz) {
  const env = { ...process.env };
  const current = env.NODE_OPTIONS ?? "";
  env.NODE_OPTIONS = current.includes(FLAG) ? current : `${current} ${FLAG}`.trim();
  if (tz) env.TZ = tz;
  else delete env.TZ;

  if (tz) {
    console.log(`\n${"─".repeat(64)}\n▶ TZ=${tz}\n${"─".repeat(64)}`);
  }

  return new Promise((resolve) => {
    /*
     * O glob é resolvido pelo próprio Node (não pelo shell), então funciona igual
     * em Linux, macOS e Windows. Passar o diretório "tests/" não serve: o runner
     * tentaria importá-lo como módulo.
     */
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--test", "tests/**/*.test.ts"],
      { cwd: root, stdio: "inherit", env },
    );
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

const allTz = process.argv.includes("--all-tz");
const targets = allTz ? TIMEZONES : [null];

let failures = 0;
for (const tz of targets) {
  const code = await runOnce(tz);
  if (code !== 0) failures += 1;
}

if (allTz) {
  const passed = targets.length - failures;
  console.log(
    `\n${failures === 0 ? "✓" : "✗"} ${passed}/${targets.length} fusos horários passaram`,
  );
}

process.exit(failures === 0 ? 0 : 1);
