/**
 * Prepara o banco no Neon:
 *   1. cria as tabelas (pode rodar quantas vezes quiser)
 *   2. cria o administrador a partir do .env
 *   3. insere produtos de exemplo se a loja estiver vazia
 *
 * Uso:  npm run setup:db
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checarConfig } from '../server/config.js';
import { sql } from '../server/db.js';
import { gerarHashSenha } from '../server/auth.js';
import { rodarArquivoSql } from './_sql-runner.js';

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

if (!checarConfig()) process.exit(1);

try {
  console.log('\n> Criando as tabelas...');
  const total = await rodarArquivoSql(path.join(raiz, 'db', 'schema.sql'));
  console.log(`  ${total} comandos aplicados.`);

  /* ---- Administrador ---- */
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const senha = process.env.ADMIN_SENHA || '';

  if (!email || senha.length < 8) {
    console.log('\n  Pulei a criação do admin: preencha ADMIN_EMAIL e ADMIN_SENHA (mín. 8 caracteres) no .env.');
  } else {
    const hash = await gerarHashSenha(senha);
    await sql`
      INSERT INTO admins (email, senha_hash, nome)
      VALUES (${email}, ${hash}, 'DulceRecordatio')
      ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash
    `;
    console.log(`\n> Administrador pronto: ${email}`);
  }

  /* ---- Dados de exemplo ---- */
  const [{ total: qtdProdutos }] = await sql`SELECT COUNT(*)::int AS total FROM produtos`;
  if (qtdProdutos === 0) {
    console.log('\n> Loja vazia: inserindo produtos e cupons de exemplo...');
    await rodarArquivoSql(path.join(raiz, 'db', 'seed.sql'));
  } else {
    console.log(`\n> ${qtdProdutos} produtos já cadastrados — não mexi em nada.`);
  }

  console.log('\n  Tudo pronto. Rode:  npm run dev\n');
  process.exit(0);
} catch (erro) {
  console.error('\n  Falhou:', erro.message, '\n');
  process.exit(1);
}
