import { neon } from '@neondatabase/serverless';
import { config } from './config.js';

/**
 * Conexão com o Neon via driver HTTP (serverless).
 *
 * Uso com template string — os valores viram parâmetros SQL automaticamente,
 * então NÃO existe risco de SQL injection aqui:
 *
 *   const linhas = await sql`SELECT * FROM produtos WHERE id = ${id}`;
 */
export const sql = neon(config.databaseUrl);

/** Executa vários comandos como uma transação só (tudo ou nada). */
export function transacao(consultas) {
  return sql.transaction(consultas);
}

/** Testa a conexão ao subir o servidor, pra falhar cedo e com mensagem clara. */
export async function testarConexao() {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (erro) {
    console.error('\n  Não consegui conectar no Neon.');
    console.error(`   ${erro.message}`);
    console.error('   Confira a DATABASE_URL no .env (e se a senha foi resetada no painel do Neon).\n');
    return false;
  }
}
