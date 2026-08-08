/**
 * Cria (ou troca a senha de) um administrador.
 *
 * Uso:  npm run criar:admin -- email@exemplo.com "minha-senha-forte"
 */
import { checarConfig } from '../server/config.js';
import { sql } from '../server/db.js';
import { gerarHashSenha } from '../server/auth.js';

if (!checarConfig()) process.exit(1);

const [email, senha] = process.argv.slice(2);

if (!email || !senha) {
  console.error('\n  Uso: npm run criar:admin -- email@exemplo.com "senha-forte"\n');
  process.exit(1);
}
if (senha.length < 8) {
  console.error('\n  A senha precisa ter no mínimo 8 caracteres.\n');
  process.exit(1);
}

try {
  const hash = await gerarHashSenha(senha);
  await sql`
    INSERT INTO admins (email, senha_hash, nome)
    VALUES (${email.toLowerCase()}, ${hash}, 'DulceRecordatio')
    ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash
  `;
  console.log(`\n  Administrador salvo: ${email}\n`);
  process.exit(0);
} catch (erro) {
  console.error('\n  Falhou:', erro.message, '\n');
  process.exit(1);
}
