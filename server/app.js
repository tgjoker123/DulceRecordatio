import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config.js';
import { rotasLoja } from './routes/loja.js';
import { rotasPedidos } from './routes/pedidos.js';
import { rotasAuth } from './routes/auth.js';
import { rotasAdmin } from './routes/admin.js';

const pastaRaiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastaPublica = path.join(pastaRaiz, 'public');

/**
 * Monta o aplicativo Express.
 *
 * Existe em duas formas porque roda em dois lugares diferentes:
 *
 * - Na sua máquina (server/index.js): o Express serve a API *e* os arquivos
 *   da pasta public — um processo só, ligado o tempo todo.
 *
 * - Na Vercel (api/[...slug].js): não existe processo ligado. Cada chamada
 *   a /api vira uma função temporária, e os arquivos de public são entregues
 *   pela CDN da Vercel, sem passar por aqui. Por isso `servirArquivos` fica
 *   desligado lá: o Express nem enxerga a pasta public no pacote publicado.
 */
export function criarApp({ servirArquivos = false } = {}) {
  const app = express();

  app.set('trust proxy', 1); // hospedagens colocam um proxy na frente; sem isso req.ip vem errado
  app.disable('x-powered-by');

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  /* ---------------- Cabeçalhos de segurança ---------------- */
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "frame-src https://*.mercadopago.com https://*.mercadolibre.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self' https://*.mercadopago.com",
      ].join('; ')
    );
    next();
  });

  /* ---------------- API ---------------- */
  // Diagnóstico de deploy: diz o que está configurado, sem revelar valor
  // nenhum. É a primeira coisa a abrir quando a loja sobe e algo não vai.
  app.get('/api/saude', (req, res) => {
    const configurado = {
      banco: Boolean(config.databaseUrl),
      chaveDeSessao: config.jwtSecret.length >= 24,
      mercadoPago: Boolean(config.mp.accessToken),
      linkDeReserva: Boolean(config.mp.linkFallback),
    };

    const resposta = { ok: true, versao: '2.0.0', configurado, siteUrl: config.siteUrl };

    // Enquanto o banco não estiver configurado, ajuda a descobrir por quê.
    // Procura nomes *parecidos* com os esperados (minúscula, hífen, espaço
    // sobrando) — que é o engano real de quem digita à mão. Não devolve
    // nome nem valor de variável nenhuma, só a contagem de quase-acertos.
    // Some sozinho assim que a configuração fica de pé.
    if (!configurado.banco) {
      const esperadas = ['DATABASE_URL', 'JWT_SECRET', 'SITE_URL', 'MP_ACCESS_TOKEN', 'MP_LINK_FALLBACK', 'FRETE_GRATIS_ACIMA'];
      const simplificar = (nome) => nome.toLowerCase().replace(/[^a-z]/g, '');
      const alvos = esperadas.map(simplificar);

      const quaseAcertos = Object.keys(process.env).filter(
        (chave) => !esperadas.includes(chave) && alvos.includes(simplificar(chave))
      ).length;

      resposta.diagnostico = quaseAcertos > 0
        ? { problema: 'nome-errado', dica: 'Existe variável com nome parecido, mas não idêntico. Os nomes distinguem maiúsculas e usam underline: DATABASE_URL, JWT_SECRET, SITE_URL.' }
        : { problema: 'nao-chegou', dica: 'Nenhuma variável com esses nomes chegou à função. Cadastre em Settings > Environment Variables, marque o ambiente Production, salve e faça Redeploy — variável nova só vale em deploy novo.' };
    }

    res.json(resposta);
  });

  app.use('/api', rotasLoja);
  app.use('/api', rotasPedidos);
  app.use('/api/auth', rotasAuth);
  app.use('/api/admin', rotasAdmin);

  app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

  /* ---------------- Site (só fora da Vercel) ---------------- */
  if (servirArquivos) {
    app.use(express.static(pastaPublica, {
      maxAge: config.isProd ? '7d' : 0,
      setHeaders(res, arquivo) {
        if (arquivo.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
      },
    }));
    // Qualquer outra URL devolve a loja (a troca de telas é feita no cliente).
    app.use((req, res) => res.sendFile(path.join(pastaPublica, 'index.html')));
  }

  /* ---------------- Tratamento de erro ---------------- */
  app.use((erro, req, res, next) => {
    const status = erro.status || 500;
    if (status >= 500) console.error('[erro]', erro);
    const podeMostrar = status < 500 || erro.exposto;
    res.status(status).json({
      erro: podeMostrar ? erro.message : 'Erro interno. Tente novamente em instantes.',
    });
  });

  return app;
}
