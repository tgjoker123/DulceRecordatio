/**
 * Entrada para rodar na sua máquina (npm run dev / npm start).
 *
 * Na Vercel este arquivo não é usado — lá a entrada é api/[...slug].js.
 */
import { checarConfig, config } from './config.js';
import { testarConexao } from './db.js';
import { criarApp } from './app.js';

if (!checarConfig()) process.exit(1);

// Falha cedo e com mensagem clara se o Neon não responder.
const conectou = await testarConexao();
if (!conectou) process.exit(1);

const app = criarApp({ servirArquivos: true });

const servidor = app.listen(config.port, () => {
  console.log(`\n  DulceRecordatio rodando em http://localhost:${config.port}`);
  console.log(`  Painel administrativo: http://localhost:${config.port}/#/entrar`);
  if (!config.mp.accessToken) {
    console.log('  Aviso: MP_ACCESS_TOKEN vazio — o checkout vai usar o link estático.');
  }
  console.log('');
});

// Sem isto, uma porta ocupada por outro projeto derruba o processo com um
// erro críptico — e dá pra achar que a loja subiu quando quem respondeu
// no navegador foi o outro programa.
servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${config.port} já está sendo usada por outro programa.`);
    console.error('  Feche o outro programa, ou troque a linha PORT no arquivo .env');
    console.error('  (por exemplo PORT=3001) e rode de novo.\n');
    process.exit(1);
  }
  throw erro;
});

export default app;
