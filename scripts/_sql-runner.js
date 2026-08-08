import { readFile } from 'node:fs/promises';
import { sql } from '../server/db.js';

/**
 * O driver HTTP do Neon executa um comando por vez, então quebramos o
 * arquivo .sql em comandos individuais. Os arquivos deste projeto usam
 * só DDL simples (sem funções com $$), então a divisão por ";" é segura.
 */
export function separarComandos(conteudo) {
  return conteudo
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean);
}

export async function executarComando(comando) {
  if (typeof sql.query === 'function') return sql.query(comando);
  return sql([comando]); // chamada equivalente a uma template string sem valores
}

export async function rodarArquivoSql(caminho) {
  const conteudo = await readFile(caminho, 'utf8');
  const comandos = separarComandos(conteudo);
  for (const comando of comandos) {
    await executarComando(comando);
  }
  return comandos.length;
}
