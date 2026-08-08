import { neon } from '@neondatabase/serverless';
import { config } from './config.js';
import { ErroHttp } from './utils.js';

/**
 * Conexão com o Neon via driver HTTP (serverless).
 *
 * O cliente é criado na primeira consulta, não na importação do arquivo.
 * Isso importa na Vercel: se `neon()` fosse chamado no topo e a
 * DATABASE_URL não estivesse cadastrada, a função inteira morreria antes
 * de responder qualquer rota — inclusive as que nem usam banco — e o
 * navegador só veria "FUNCTION_INVOCATION_FAILED", sem pista do motivo.
 * Adiando, o erro vira uma mensagem legível na resposta.
 */
let cliente = null;

function obterCliente() {
  if (cliente) return cliente;
  if (!config.databaseUrl) {
    throw new ErroHttp(
      500,
      'Banco não configurado: falta a variável DATABASE_URL no ambiente da hospedagem.',
      { exposto: true }
    );
  }
  cliente = neon(config.databaseUrl);
  return cliente;
}

/**
 * Uso com template string — os valores viram parâmetros SQL automaticamente,
 * então NÃO existe risco de SQL injection aqui:
 *
 *   const linhas = await sql`SELECT * FROM produtos WHERE id = ${id}`;
 */
export function sql(...argumentos) {
  return obterCliente()(...argumentos);
}

/** Comando único sem template string (usado pelos scripts de instalação). */
sql.query = (...argumentos) => obterCliente().query(...argumentos);

/** Executa vários comandos como uma transação só (tudo ou nada). */
sql.transaction = (...argumentos) => obterCliente().transaction(...argumentos);

export function transacao(consultas) {
  return obterCliente().transaction(consultas);
}

/** Testa a conexão ao subir o servidor local, pra falhar cedo e com mensagem clara. */
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
