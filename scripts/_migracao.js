import { sql } from '../server/db.js';

/**
 * Ajusta um banco que já existia de uma versão anterior da loja.
 *
 * Só ADICIONA o que falta — nunca apaga coluna nem tabela, então os produtos
 * e cupons já cadastrados continuam intactos.
 *
 * Num banco novo isto não faz nada: o schema.sql já criou tudo certo.
 */

/** Colunas que cada tabela precisa ter, com o tipo usado ao adicionar. */
const COLUNAS_ESPERADAS = {
  produtos: {
    ativo: 'BOOLEAN NOT NULL DEFAULT TRUE',
    destaque: 'BOOLEAN NOT NULL DEFAULT FALSE',
    desc_curta: "TEXT NOT NULL DEFAULT ''",
    img: "TEXT NOT NULL DEFAULT ''",
    criado_em: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()',
    atualizado_em: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()',
  },
  cupons: {
    ativo: 'BOOLEAN NOT NULL DEFAULT TRUE',
    validade: 'DATE',
    min_subtotal: 'NUMERIC(10,2) NOT NULL DEFAULT 0',
    usos: 'INTEGER NOT NULL DEFAULT 0',
    max_usos: 'INTEGER',
    criado_em: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()',
  },
  pedidos: {
    // Sem NOT NULL aqui de propósito: a tabela antiga pode já ter linhas,
    // e uma coluna obrigatória sem valor quebraria a migração.
    codigo: 'TEXT',
    cliente_telefone: 'TEXT',
    cliente_email: 'TEXT',
    endereco_cep: 'TEXT',
    endereco_rua: 'TEXT',
    endereco_bairro: 'TEXT',
    endereco_cidade: 'TEXT',
    itens: 'JSONB',
    frete: 'NUMERIC(10,2) NOT NULL DEFAULT 0',
    frete_tipo: 'TEXT',
    desconto: 'NUMERIC(10,2) NOT NULL DEFAULT 0',
    cupom: 'TEXT',
    status: "TEXT NOT NULL DEFAULT 'aguardando_pagamento'",
    pagamento_id: 'TEXT',
    preference_id: 'TEXT',
    estoque_baixado: 'BOOLEAN NOT NULL DEFAULT FALSE',
    criado_em: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()',
    atualizado_em: 'TIMESTAMPTZ NOT NULL DEFAULT NOW()',
  },
};

/**
 * Colunas de versões antigas que continuam na tabela mas que o código atual
 * não preenche. Se forem obrigatórias, todo pedido novo falharia — então
 * afrouxamos a obrigatoriedade em vez de apagar a coluna.
 */
const LEGADO_A_AFROUXAR = {
  pedidos: ['cliente_whatsapp', 'endereco', 'bairro', 'cidade'],
};

async function colunasDe(tabela) {
  const linhas = await sql`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tabela}
  `;
  return linhas;
}

async function tabelaExiste(tabela) {
  const [linha] = await sql`
    SELECT 1 AS ok FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ${tabela}
  `;
  return Boolean(linha);
}

export async function migrar() {
  const mudancas = [];

  for (const [tabela, esperadas] of Object.entries(COLUNAS_ESPERADAS)) {
    if (!(await tabelaExiste(tabela))) continue;

    const existentes = await colunasDe(tabela);
    const nomes = new Set(existentes.map((c) => c.column_name));

    // 1. Adiciona o que falta.
    for (const [coluna, tipo] of Object.entries(esperadas)) {
      if (nomes.has(coluna)) continue;
      // Nomes vêm do mapa acima (código nosso), nunca de entrada do usuário.
      await sql.query(`ALTER TABLE ${tabela} ADD COLUMN IF NOT EXISTS ${coluna} ${tipo}`);
      mudancas.push(`+ ${tabela}.${coluna}`);
    }

    // 2. Afrouxa colunas antigas obrigatórias que o código não preenche mais.
    for (const coluna of LEGADO_A_AFROUXAR[tabela] || []) {
      const info = existentes.find((c) => c.column_name === coluna);
      if (!info || info.is_nullable === 'YES') continue;
      await sql.query(`ALTER TABLE ${tabela} ALTER COLUMN ${coluna} DROP NOT NULL`);
      mudancas.push(`~ ${tabela}.${coluna} deixou de ser obrigatória`);
    }
  }

  // 3. O código exige código de pedido único; índice funciona em tabela antiga.
  if (await tabelaExiste('pedidos')) {
    await sql.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_pedidos_codigo ON pedidos (codigo)');
  }

  return mudancas;
}
