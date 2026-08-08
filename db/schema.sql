-- =============================================================
-- DulceRecordatio - estrutura do banco (Neon / PostgreSQL)
-- Aplicado automaticamente por: npm run setup:db
-- Pode ser rodado quantas vezes quiser (nada é apagado).
-- =============================================================

-- ---------- Produtos ----------
CREATE TABLE IF NOT EXISTS produtos (
  id            SERIAL PRIMARY KEY,
  nome          TEXT NOT NULL,
  cat           TEXT NOT NULL DEFAULT 'encadernacao',
  preco         NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  estoque       INTEGER NOT NULL DEFAULT 0 CHECK (estoque >= 0),
  desc_curta    TEXT NOT NULL DEFAULT '',
  img           TEXT NOT NULL DEFAULT '',
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  destaque      BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_produtos_cat   ON produtos (cat);
CREATE INDEX IF NOT EXISTS idx_produtos_ativo ON produtos (ativo);

-- ---------- Cupons ----------
CREATE TABLE IF NOT EXISTS cupons (
  id           SERIAL PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,
  discount     INTEGER NOT NULL CHECK (discount BETWEEN 1 AND 90),
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  validade     DATE,
  min_subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  usos         INTEGER NOT NULL DEFAULT 0,
  max_usos     INTEGER,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------- Pedidos ----------
CREATE TABLE IF NOT EXISTS pedidos (
  id               SERIAL PRIMARY KEY,
  codigo           TEXT NOT NULL UNIQUE,
  cliente_nome     TEXT NOT NULL,
  cliente_telefone TEXT NOT NULL,
  cliente_email    TEXT,
  endereco_cep     TEXT,
  endereco_rua     TEXT,
  endereco_bairro  TEXT,
  endereco_cidade  TEXT,
  itens            JSONB NOT NULL,
  subtotal         NUMERIC(10,2) NOT NULL,
  frete            NUMERIC(10,2) NOT NULL DEFAULT 0,
  frete_tipo       TEXT,
  desconto         NUMERIC(10,2) NOT NULL DEFAULT 0,
  cupom            TEXT,
  total            NUMERIC(10,2) NOT NULL,
  status           TEXT NOT NULL DEFAULT 'aguardando_pagamento',
  pagamento_id     TEXT,
  preference_id    TEXT,
  estoque_baixado  BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos (status);
CREATE INDEX IF NOT EXISTS idx_pedidos_criado ON pedidos (criado_em DESC);

-- ---------- Administradores ----------
-- A senha NUNCA é guardada em texto puro: só o hash bcrypt.
CREATE TABLE IF NOT EXISTS admins (
  id         SERIAL PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  nome       TEXT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
