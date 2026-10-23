/**
 * Lançador do Next CLI.
 *
 * Único propósito: definir NODE_OPTIONS antes de o Node subir, para silenciar o
 * aviso "SQLite is an experimental feature". O driver nativo `node:sqlite` é
 * experimental no Node 22 (estável no 24+), mas é usado aqui de forma restrita e
 * testada — o aviso só polui os logs.
 *
 * Feito por um script (e não por `NODE_OPTIONS=... next dev` no package.json)
 * para funcionar igual em Linux, macOS e Windows.
 *
 * Uso: node scripts/run-next.mjs dev -H 0.0.0.0 -p 3000
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");

if (!fs.existsSync(nextBin)) {
  console.error("Next.js não encontrado. Rode `npm install` primeiro.");
  process.exit(1);
}

const FLAG = "--disable-warning=ExperimentalWarning";
const current = process.env.NODE_OPTIONS ?? "";
process.env.NODE_OPTIONS = current.includes(FLAG)
  ? current
  : `${current} ${FLAG}`.trim();

const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
