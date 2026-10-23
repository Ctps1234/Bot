/**
 * Adaptador de banco SQLite.
 *
 * Drivers suportados (mesma API prepare/run/get/all/exec):
 *   - `node:sqlite`       driver nativo do Node >= 22.5 — padrão, zero dependências binárias
 *   - `better-sqlite3`    recomendado em produção; use DB_DRIVER=better-sqlite3
 *
 * `node:sqlite` é importado estaticamente (é builtin do Node e o Next o mantém
 * externo no bundle de servidor). Já o `better-sqlite3` é carregado por um require
 * que o bundler não analisa estaticamente: assim a ausência do pacote opcional
 * nunca quebra a compilação, apenas desativa aquele driver em runtime.
 */

import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | bigint | null;
export type SqlRow = Record<string, unknown>;

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement {
  run(...params: SqlValue[]): RunResult;
  get(...params: SqlValue[]): SqlRow | undefined;
  all(...params: SqlValue[]): SqlRow[];
}

export interface Database {
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(fn: () => T): T;
  close(): void;
  readonly driver: DriverName;
}

export type DriverName = "node:sqlite" | "better-sqlite3";

/* ------------------------------- utilidades -------------------------------- */

/**
 * Carrega o driver opcional `better-sqlite3`.
 *
 * O nome do módulo é um **literal** de propósito: assim o bundler resolve a
 * dependência estaticamente (ela está em `serverExternalPackages`, portanto vira
 * um require de runtime) sem gerar o aviso "Critical dependency". Se o pacote não
 * estiver instalado, o erro é capturado e o driver nativo assume.
 */
declare const __non_webpack_require__: ((id: string) => unknown) | undefined;

function loadOptionalDriver(): unknown {
  try {
    // No bundle do Next: `__non_webpack_require__` é o require real do Node.
    if (typeof __non_webpack_require__ === "function") {
      return __non_webpack_require__("better-sqlite3");
    }
    // Fora do bundle (tsx / node puro). O eval é o escape hatch padrão para o
    // bundler não tentar resolver o pacote opcional em tempo de build.
    // eslint-disable-next-line no-eval
    const cjsRequire = eval(
      "typeof require === 'function' ? require : undefined",
    ) as ((id: string) => unknown) | undefined;
    if (cjsRequire) return cjsRequire("better-sqlite3");
  } catch {
    /* pacote opcional não instalado — segue com node:sqlite */
  }
  return null;
}

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

function normalizeRow<T>(row: unknown): T {
  return (row === undefined || row === null ? row : normalize(row)) as T;
}

function fileUrlToPath(url: string): string {
  const raw = url.startsWith("file:") ? url.slice(5) : url;
  // file:///abs/x.db -> /abs/x.db  |  file:./data/x.db -> ./data/x.db
  return raw.replace(/^\/\/\//, "/");
}

export function resolveDbPath(databaseUrl?: string): string {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? "file:./data/oficina.db";
  const p = fileUrlToPath(url);
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

/* --------------------------------- drivers --------------------------------- */

function openNodeSqlite(filePath: string, readonly: boolean): Database {
  if (typeof DatabaseSync !== "function") {
    throw new Error(
      "node:sqlite indisponível neste runtime. Use Node >= 22.5 ou instale better-sqlite3 " +
        "e defina DB_DRIVER=better-sqlite3.",
    );
  }

  const raw = new DatabaseSync(filePath, { readOnly: readonly }) as unknown as {
    exec(sql: string): void;
    prepare(sql: string): {
      run(...p: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
      get(...p: SqlValue[]): unknown;
      all(...p: SqlValue[]): unknown;
      finalize?(): void;
    };
    close?(): void;
  };
  raw.exec("PRAGMA journal_mode = WAL");
  raw.exec("PRAGMA foreign_keys = ON");
  raw.exec("PRAGMA busy_timeout = 5000");

  return {
    driver: "node:sqlite",
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const st = raw.prepare(sql);
      return {
        run: (...p) => {
          const r = st.run(...p);
          return {
            changes: Number(r?.changes ?? 0),
            lastInsertRowid: Number(r?.lastInsertRowid ?? 0),
          };
        },
        get: (...p) => normalizeRow(st.get(...p)),
        all: (...p) => normalizeRow<SqlRow[]>(st.all(...p)) ?? [],
      };
    },
    transaction: withReentrantTransaction(
      () => raw.exec("BEGIN"),
      () => raw.exec("COMMIT"),
      () => raw.exec("ROLLBACK"),
    ),
    close: () => {
      // node:sqlite não expõe close em todas as versões — protegido para não quebrar.
      const maybe = raw as unknown as { close?: () => void };
      maybe.close?.();
    },
  };
}

function openBetterSqlite3(filePath: string, readonly: boolean): Database {
  const mod = loadOptionalDriver();
  if (!mod) {
    throw new Error(
      "better-sqlite3 não está instalado (npm i better-sqlite3). " +
        "Sem ele, use o driver nativo node:sqlite.",
    );
  }
  const BetterSqlite3 =
    (mod as { Database?: unknown }).Database ??
    ((mod as { default?: { Database?: unknown } }).default?.Database ?? mod);

  const Ctor = BetterSqlite3 as new (
    file: string,
    opts?: { readonly?: boolean; fileMustExist?: boolean },
  ) => {
    exec(sql: string): void;
    pragma(pragma: string): void;
    prepare(sql: string): {
      run(...p: SqlValue[]): { changes: number; lastInsertRowid: number };
      get(...p: SqlValue[]): unknown;
      all(...p: SqlValue[]): unknown;
    };
    transaction<T>(fn: () => T): () => T;
    close(): void;
  };

  const raw = new Ctor(filePath, { readonly, fileMustExist: false });
  raw.pragma("journal_mode = WAL");
  raw.pragma("foreign_keys = ON");
  raw.pragma("busy_timeout = 5000");

  return {
    driver: "better-sqlite3",
    exec: (sql) => raw.exec(sql),
    prepare: (sql) => {
      const st = raw.prepare(sql);
      return {
        run: (...p) => {
          const r = st.run(...p);
          return {
            changes: Number(r.changes ?? 0),
            lastInsertRowid: Number(r.lastInsertRowid ?? 0),
          };
        },
        get: (...p) => normalizeRow(st.get(...p)),
        all: (...p) => normalizeRow<SqlRow[]>(st.all(...p)) ?? [],
      };
    },
    transaction: withReentrantTransaction(
      () => raw.exec("BEGIN"),
      () => raw.exec("COMMIT"),
      () => raw.exec("ROLLBACK"),
    ),
    close: () => raw.close(),
  };
}

function createConnection(filePath: string): Database {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const preference = (process.env.DB_DRIVER ?? "").trim();
  const order: DriverName[] =
    preference === "better-sqlite3"
      ? ["better-sqlite3", "node:sqlite"]
      : preference === "node:sqlite"
        ? ["node:sqlite"]
        : ["node:sqlite", "better-sqlite3"];

  const errors: string[] = [];
  for (const driver of order) {
    try {
      return driver === "node:sqlite"
        ? openNodeSqlite(filePath, false)
        : openBetterSqlite3(filePath, false);
    } catch (error) {
      errors.push(`${driver}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `Não foi possível abrir o SQLite em ${filePath}.\n${errors.map((e) => `  - ${e}`).join("\n")}`,
  );
}

/**
 * Torna `transaction` reentrante: SQLite não aceita BEGIN aninhado, então chamadas
 * internas (ex.: criar OS -> gerar número sequencial) apenas executam a função e o
 * rollback fica a cargo da transação mais externa.
 */
function withReentrantTransaction(
  begin: () => void,
  commit: () => void,
  rollback: () => void,
): <T>(fn: () => T) => T {
  let depth = 0;
  return <T>(fn: () => T): T => {
    if (depth > 0) {
      depth += 1;
      try {
        return fn();
      } finally {
        depth -= 1;
      }
    }
    depth = 1;
    begin();
    try {
      const result = fn();
      commit();
      return result;
    } catch (error) {
      try {
        rollback();
      } catch {
        /* rollback já falhou — propaga o erro original */
      }
      throw error;
    } finally {
      depth = 0;
    }
  };
}


/* -------------------------------- conexão --------------------------------- */

/** Conexão única por processo (sobrevive ao hot-reload do Next em dev). */
export function getDb(): Database {
  const g = globalThis as unknown as { __oficinaDb?: Database };
  if (!g.__oficinaDb) g.__oficinaDb = createConnection(resolveDbPath());
  return g.__oficinaDb;
}

export function getDriverName(): DriverName {
  return getDb().driver;
}

let migrated = false;

/**
 * Aplica migrations SQL pendentes de prisma/migrations/*.sql (ordem alfabética).
 * Idempotente — pode ser chamada em todo boot.
 */
export function migrate(): { applied: string[] } {
  const db = getDb();
  if (migrated) return { applied: [] };

  const dir = path.join(process.cwd(), "prisma", "migrations");
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL
  )`);

  const done = new Set(
    db.prepare("SELECT name FROM _migrations").all().map((r) => String(r.name)),
  );
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    : [];

  const newly: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    });
    newly.push(file);
  }

  migrated = true;
  return { applied: newly };
}

/** Garante conexão + schema aplicado. Use no boot de páginas e rotas. */
export function ensureDb(): Database {
  migrate();
  return getDb();
}
