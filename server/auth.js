import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { sql } from './db.js';
import { ErroHttp } from './utils.js';

const NOME_COOKIE = 'dulce_token';
const VALIDADE = '8h';

export function gerarHashSenha(senha) {
  return bcrypt.hash(senha, 12);
}

/**
 * Confere e-mail + senha contra a tabela `admins`.
 * Nunca diz qual dos dois está errado (não entrega e-mails válidos pra quem chuta).
 */
export async function autenticar(email, senha) {
  const [admin] = await sql`SELECT id, email, nome, senha_hash FROM admins WHERE email = ${email.toLowerCase()}`;
  if (!admin) {
    await bcrypt.compare(senha, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv'); // gasta o mesmo tempo
    return null;
  }
  const ok = await bcrypt.compare(senha, admin.senha_hash);
  if (!ok) return null;
  return { id: admin.id, email: admin.email, nome: admin.nome };
}

export function enviarCookieSessao(res, admin) {
  const token = jwt.sign({ sub: admin.id, email: admin.email }, config.jwtSecret, { expiresIn: VALIDADE });
  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,               // JavaScript da página não consegue ler: protege contra roubo de sessão
    sameSite: 'lax',
    secure: config.isProd,        // só trafega por HTTPS em produção
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
}

export function limparCookieSessao(res) {
  res.clearCookie(NOME_COOKIE, { path: '/' });
}

/** Middleware: barra qualquer rota /api/admin/* sem sessão válida. */
export function exigirAdmin(req, res, next) {
  const token = req.cookies?.[NOME_COOKIE];
  if (!token) return next(new ErroHttp(401, 'Faça login para continuar.'));
  try {
    req.admin = jwt.verify(token, config.jwtSecret);
    next();
  } catch {
    next(new ErroHttp(401, 'Sessão expirada. Entre novamente.'));
  }
}

/* ------------------------------------------------------------------
   Limite de tentativas de login (protege contra força bruta).
   Guardado em memória: some se o servidor reiniciar, e é o suficiente
   para uma loja desse porte.
------------------------------------------------------------------ */
const tentativas = new Map();
const MAX_TENTATIVAS = 6;
const JANELA_MS = 15 * 60 * 1000;

export function checarTentativas(ip) {
  const registro = tentativas.get(ip);
  if (!registro) return;
  if (Date.now() - registro.desde > JANELA_MS) {
    tentativas.delete(ip);
    return;
  }
  if (registro.contador >= MAX_TENTATIVAS) {
    throw new ErroHttp(429, 'Muitas tentativas. Espere 15 minutos e tente de novo.');
  }
}

export function registrarFalha(ip) {
  const registro = tentativas.get(ip);
  if (!registro || Date.now() - registro.desde > JANELA_MS) {
    tentativas.set(ip, { contador: 1, desde: Date.now() });
  } else {
    registro.contador++;
  }
}

export function limparTentativas(ip) {
  tentativas.delete(ip);
}
