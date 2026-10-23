-- Schema inicial: oficina elétrica automotiva (single-tenant)
-- Valores monetários são armazenados em CENTAVOS (INTEGER) para evitar erro de ponto flutuante.
-- Datas são armazenadas como texto ISO-8601 (UTC).

-- Observação: journal_mode (WAL), foreign_keys e busy_timeout são definidos pelo
-- adaptador de banco na abertura da conexão (src/server/db/index.ts), pois esses
-- PRAGMAs não podem ser executados dentro de uma transação.
-- A tabela de controle `_migrations` é criada pelo runner de migrations.

CREATE TABLE users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'TECNICO'
                CHECK (role IN ('ADMIN','GESTOR','TECNICO','RECEPCAO')),
  phone         TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL,
  updated_at    TEXT    NOT NULL
);

-- Configurações da oficina (chave/valor): nome, telefone, endereço, sequência da OS etc.
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  person_type TEXT NOT NULL DEFAULT 'FISICA' CHECK (person_type IN ('FISICA','JURIDICA')),
  document   TEXT,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  notes      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE vehicles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  plate        TEXT NOT NULL,
  brand        TEXT,
  model        TEXT,
  year         INTEGER,
  color        TEXT,
  voltage      TEXT NOT NULL DEFAULT '12V' CHECK (voltage IN ('12V','24V','12V/24V','OUTRO')),
  fleet_number TEXT,
  notes        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT
);

CREATE UNIQUE INDEX vehicles_plate_alive ON vehicles(plate) WHERE deleted_at IS NULL;
CREATE INDEX vehicles_client ON vehicles(client_id);
CREATE INDEX clients_name ON clients(name);

CREATE TABLE orders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  number            TEXT NOT NULL UNIQUE,
  client_id         INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  vehicle_id        INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'ABERTA'
                    CHECK (status IN ('ABERTA','EM_EXECUCAO','CONCLUIDA','ENTREGUE','CANCELADA')),
  entry_date        TEXT NOT NULL,
  expected_finish   TEXT,
  finished_at       TEXT,
  delivered_at      TEXT,
  canceled_at       TEXT,
  mileage_in        INTEGER,
  fuel_level        INTEGER CHECK (fuel_level BETWEEN 0 AND 100),
  reported_issue    TEXT NOT NULL DEFAULT '',
  diagnosis         TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  warranty_months   INTEGER NOT NULL DEFAULT 3,
  technician_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  discount_cents    INTEGER NOT NULL DEFAULT 0,
  items_total_cents INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL DEFAULT 0,
  paid_cents        INTEGER NOT NULL DEFAULT 0,
  financial_status  TEXT NOT NULL DEFAULT 'PENDENTE'
                    CHECK (financial_status IN ('PENDENTE','PARCIAL','PAGO')),
  created_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX orders_status ON orders(status);
CREATE INDEX orders_client ON orders(client_id);
CREATE INDEX orders_vehicle ON orders(vehicle_id);
CREATE INDEX orders_entry ON orders(entry_date);
CREATE INDEX orders_tech ON orders(technician_id);

CREATE TABLE order_items (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('PECA','SERVICO')),
  description      TEXT NOT NULL,
  quantity         REAL NOT NULL DEFAULT 1,
  unit_price_cents INTEGER NOT NULL DEFAULT 0,
  total_cents      INTEGER NOT NULL DEFAULT 0,
  warranty_months  INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  sort             INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

CREATE INDEX order_items_order ON order_items(order_id);

CREATE TABLE payments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method     TEXT NOT NULL DEFAULT 'DINHEIRO'
             CHECK (method IN ('DINHEIRO','PIX','DEBITO','CREDITO','TRANSFERENCIA','BOLETO','OUTRO')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at    TEXT NOT NULL,
  note       TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX payments_order ON payments(order_id);
CREATE INDEX payments_date ON payments(paid_at);
