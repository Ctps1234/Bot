/**
 * Preparação do ambiente (roda automaticamente antes de `npm run dev` e `npm run build`).
 *
 *  1. Garante que exista um .env (copia .env.example se necessário)
 *  2. Aplica as migrations e popula o banco (idempotente — nada é sobrescrito)
 *
 * Para apagar tudo e recomeçar: `npm run db:fresh`
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function step(message) {
  process.stdout.write(`\x1b[36m→\x1b[0m ${message}\n`);
}

function warn(message) {
  process.stdout.write(`\x1b[33m!\x1b[0m ${message}\n`);
}

/* 1) .env ------------------------------------------------------------------- */

const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

if (!fs.existsSync(envPath) && fs.existsSync(examplePath)) {
  let contents = fs.readFileSync(examplePath, "utf8");
  // gera um segredo de sessão aleatório em vez de usar o valor de exemplo
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  contents = contents.replace(
    /AUTH_SECRET="[^"]*"/,
    `AUTH_SECRET="${secret}"`,
  );
  fs.writeFileSync(envPath, contents);
  step(".env criado a partir de .env.example (AUTH_SECRET gerado)");
} else if (fs.existsSync(envPath)) {
  step(".env presente");
} else {
  warn("nenhum .env nem .env.example encontrado — usando valores padrão");
}

/* 2) Node >= 22.5 ----------------------------------------------------------- */

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 5)) {
  warn(
    `Node ${process.versions.node} detectado. O driver nativo node:sqlite exige Node >= 22.5. ` +
      `Instale better-sqlite3 (npm i better-sqlite3) e defina DB_DRIVER=better-sqlite3.`,
  );
}

/* 3) migrations + seed ------------------------------------------------------ */

step("preparando banco de dados (migrations + carga inicial)…");

const tsxBin = path.join(root, "node_modules", ".bin", "tsx");
const tsxExists = fs.existsSync(tsxBin);

// O driver nativo node:sqlite é marcado "experimental" no Node 22 e imprime um
// aviso por processo. Ele é inofensivo aqui, então silenciamos apenas esse aviso.
const existingNodeOptions = process.env.NODE_OPTIONS ?? "";
const childEnv = {
  ...process.env,
  NODE_OPTIONS: `${existingNodeOptions} --disable-warning=ExperimentalWarning`.trim(),
};

const result = spawnSync(
  tsxExists ? tsxBin : process.execPath,
  tsxExists
    ? [path.join(root, "prisma", "seed.ts"), ...process.argv.slice(2)]
    : [
        "--experimental-strip-types",
        "--disable-warning=ExperimentalWarning",
        path.join(root, "prisma", "seed.ts"),
        ...process.argv.slice(2),
      ],
  { cwd: root, stdio: "inherit", env: childEnv },
);

if (result.status !== 0) {
  warn(
    "a carga inicial não terminou com sucesso. O app ainda sobe; rode `npm run db:seed` para tentar novamente.",
  );
}

process.stdout.write("\n");
