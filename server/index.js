import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checarConfig, config } from './config.js';
import { testarConexao } from './db.js';
import { rotasLoja } from './routes/loja.js';
import { rotasPedidos } from './routes/pedidos.js';
import { rotasAuth } from './routes/auth.js';
import { rotasAdmin } from './routes/admin.js';

const pastaRaiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastaPublica = path.join(pastaRaiz, 'public');

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
      "script-src 'self' https://sdk.mercadopago.com https://cdnjs.cloudflare.com https://*.mlstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
      "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:",
      "img-src 'self' data: https:",
      "connect-src 'self' https://api.mercadopago.com https://*.mercadopago.com https://*.mlstatic.com",
      "frame-src https://*.mercadopago.com https://*.mercadolibre.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://*.mercadopago.com",
    ].join('; ')
  );
  next();
});

/* ---------------- API ---------------- */
app.use('/api', rotasLoja);
app.use('/api', rotasPedidos);
app.use('/api/auth', rotasAuth);
app.use('/api/admin', rotasAdmin);

app.get('/api/saude', (req, res) => res.json({ ok: true, versao: '2.0.0' }));

app.use('/api', (req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

/* ---------------- Site ---------------- */
app.use(express.static(pastaPublica, {
  maxAge: config.isProd ? '7d' : 0,
  setHeaders(res, arquivo) {
    if (arquivo.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));

// Qualquer outra URL devolve a loja (a navegação entre telas é feita no cliente).
app.use((req, res) => res.sendFile(path.join(pastaPublica, 'index.html')));

/* ---------------- Tratamento de erro ---------------- */
app.use((erro, req, res, next) => {
  const status = erro.status || 500;
  if (status >= 500) console.error('[erro]', erro);
  res.status(status).json({
    erro: status >= 500 ? 'Erro interno. Tente novamente em instantes.' : erro.message,
  });
});

/* ---------------- Sobe o servidor ---------------- */
if (!checarConfig()) process.exit(1);

const conectou = await testarConexao();
if (!conectou) process.exit(1);

app.listen(config.port, () => {
  console.log(`\n  DulceRecordatio rodando em http://localhost:${config.port}`);
  console.log(`  Painel administrativo: http://localhost:${config.port}/#/admin`);
  if (!config.mp.accessToken) {
    console.log('  Aviso: MP_ACCESS_TOKEN vazio — o checkout vai usar o link estático.');
  }
  console.log('');
});

export default app;
