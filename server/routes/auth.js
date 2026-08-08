import { Router } from 'express';
import {
  autenticar, checarTentativas, enviarCookieSessao, exigirAdmin,
  limparCookieSessao, limparTentativas, registrarFalha,
} from '../auth.js';
import { rota, texto } from '../utils.js';

export const rotasAuth = Router();

rotasAuth.post('/login', rota(async (req, res) => {
  const ip = req.ip;
  checarTentativas(ip);

  const email = texto(req.body?.email, 'e-mail', { max: 160 }).toLowerCase();
  const senha = texto(req.body?.senha, 'senha', { max: 200 });

  const admin = await autenticar(email, senha);
  if (!admin) {
    registrarFalha(ip);
    return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
  }

  limparTentativas(ip);
  enviarCookieSessao(res, admin);
  res.json({ admin: { email: admin.email, nome: admin.nome } });
}));

rotasAuth.post('/logout', (req, res) => {
  limparCookieSessao(res);
  res.json({ ok: true });
});

/** Usado pelo front ao carregar a página: "ainda estou logado?" */
rotasAuth.get('/me', exigirAdmin, (req, res) => {
  res.json({ admin: { email: req.admin.email } });
});
