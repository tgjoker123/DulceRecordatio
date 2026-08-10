import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sql } from '../db.js';
import { exigirAdmin, gerarHashSenha, limparCookieSessao } from '../auth.js';
import { dinheiro, erro400, ErroHttp, inteiro, numero, rota, texto, textoOpcional } from '../utils.js';

export const rotasAdmin = Router();

// Tudo daqui pra baixo exige sessão de administrador.
rotasAdmin.use(exigirAdmin);

const CATEGORIAS = ['encadernacao', 'decoracao'];
const STATUS_VALIDOS = ['aguardando_pagamento', 'pago', 'enviado', 'entregue', 'cancelado', 'estornado'];

/* ---------------------- Painel ---------------------- */

rotasAdmin.get('/resumo', rota(async (req, res) => {
  const [[vendas], [pendentes], [semEstoque], [produtos]] = await Promise.all([
    sql`SELECT COALESCE(SUM(total),0) AS receita, COUNT(*) AS pedidos FROM pedidos WHERE status IN ('pago','enviado','entregue')`,
    sql`SELECT COUNT(*) AS total FROM pedidos WHERE status = 'aguardando_pagamento'`,
    sql`SELECT COUNT(*) AS total FROM produtos WHERE ativo = TRUE AND estoque = 0`,
    sql`SELECT COUNT(*) AS total FROM produtos WHERE ativo = TRUE`,
  ]);

  res.json({
    receita: dinheiro(vendas.receita),
    pedidosPagos: Number(vendas.pedidos),
    pedidosPendentes: Number(pendentes.total),
    produtosSemEstoque: Number(semEstoque.total),
    produtosAtivos: Number(produtos.total),
  });
}));

/* ---------------------- Produtos ---------------------- */

function lerProduto(corpo) {
  const cat = String(corpo?.cat || '').trim();
  if (!CATEGORIAS.includes(cat)) throw erro400('Categoria inválida.');
  return {
    nome: texto(corpo?.nome, 'nome', { min: 2, max: 120 }),
    cat,
    preco: dinheiro(numero(corpo?.preco, 'preço', { min: 0.01, max: 100000 })),
    estoque: inteiro(corpo?.estoque ?? 0, 'estoque', { min: 0, max: 100000 }),
    desc_curta: textoOpcional(corpo?.desc_curta, 400),
    img: textoOpcional(corpo?.img, 600),
    ativo: corpo?.ativo !== false,
    destaque: corpo?.destaque === true,
  };
}

rotasAdmin.get('/produtos', rota(async (req, res) => {
  const produtos = await sql`SELECT * FROM produtos ORDER BY id DESC`;
  res.json(produtos.map((p) => ({ ...p, preco: dinheiro(p.preco) })));
}));

rotasAdmin.post('/produtos', rota(async (req, res) => {
  const p = lerProduto(req.body);
  const [novo] = await sql`
    INSERT INTO produtos (nome, cat, preco, estoque, desc_curta, img, ativo, destaque)
    VALUES (${p.nome}, ${p.cat}, ${p.preco}, ${p.estoque}, ${p.desc_curta}, ${p.img}, ${p.ativo}, ${p.destaque})
    RETURNING *
  `;
  res.status(201).json(novo);
}));

rotasAdmin.put('/produtos/:id', rota(async (req, res) => {
  const id = inteiro(req.params.id, 'id', { min: 1 });
  const p = lerProduto(req.body);
  const [atualizado] = await sql`
    UPDATE produtos SET
      nome = ${p.nome}, cat = ${p.cat}, preco = ${p.preco}, estoque = ${p.estoque},
      desc_curta = ${p.desc_curta}, img = ${p.img}, ativo = ${p.ativo}, destaque = ${p.destaque},
      atualizado_em = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  if (!atualizado) return res.status(404).json({ erro: 'Produto não encontrado.' });
  res.json(atualizado);
}));

rotasAdmin.delete('/produtos/:id', rota(async (req, res) => {
  const id = inteiro(req.params.id, 'id', { min: 1 });
  await sql`DELETE FROM produtos WHERE id = ${id}`;
  res.json({ ok: true });
}));

/* ---------------------- Cupons ---------------------- */

rotasAdmin.get('/cupons', rota(async (req, res) => {
  res.json(await sql`SELECT * FROM cupons ORDER BY id DESC`);
}));

function lerCupom(corpo) {
  const code = texto(corpo?.code, 'código', { min: 3, max: 30 }).toUpperCase().replace(/\s+/g, '');
  return {
    code,
    discount: inteiro(corpo?.discount, 'desconto', { min: 1, max: 90 }),
    min_subtotal: dinheiro(numero(corpo?.min_subtotal ?? 0, 'valor mínimo', { min: 0, max: 100000 })),
    validade: corpo?.validade ? String(corpo.validade).slice(0, 10) : null,
    max_usos: corpo?.max_usos ? inteiro(corpo.max_usos, 'limite de usos', { min: 1, max: 100000 }) : null,
    ativo: corpo?.ativo !== false,
  };
}

rotasAdmin.post('/cupons', rota(async (req, res) => {
  const c = lerCupom(req.body);
  const [existente] = await sql`SELECT id FROM cupons WHERE code = ${c.code}`;
  if (existente) return res.status(409).json({ erro: 'Já existe um cupom com esse código.' });

  const [novo] = await sql`
    INSERT INTO cupons (code, discount, min_subtotal, validade, max_usos, ativo)
    VALUES (${c.code}, ${c.discount}, ${c.min_subtotal}, ${c.validade}, ${c.max_usos}, ${c.ativo})
    RETURNING *
  `;
  res.status(201).json(novo);
}));

rotasAdmin.put('/cupons/:id', rota(async (req, res) => {
  const id = inteiro(req.params.id, 'id', { min: 1 });
  const c = lerCupom(req.body);
  const [atualizado] = await sql`
    UPDATE cupons SET
      code = ${c.code}, discount = ${c.discount}, min_subtotal = ${c.min_subtotal},
      validade = ${c.validade}, max_usos = ${c.max_usos}, ativo = ${c.ativo}
    WHERE id = ${id}
    RETURNING *
  `;
  if (!atualizado) return res.status(404).json({ erro: 'Cupom não encontrado.' });
  res.json(atualizado);
}));

rotasAdmin.delete('/cupons/:id', rota(async (req, res) => {
  const id = inteiro(req.params.id, 'id', { min: 1 });
  await sql`DELETE FROM cupons WHERE id = ${id}`;
  res.json({ ok: true });
}));

/* ---------------------- Pedidos ---------------------- */

rotasAdmin.get('/pedidos', rota(async (req, res) => {
  const status = String(req.query.status || '').trim();
  const pedidos = status && STATUS_VALIDOS.includes(status)
    ? await sql`SELECT * FROM pedidos WHERE status = ${status} ORDER BY criado_em DESC LIMIT 200`
    : await sql`SELECT * FROM pedidos ORDER BY criado_em DESC LIMIT 200`;
  res.json(pedidos.map((p) => ({ ...p, total: dinheiro(p.total), subtotal: dinheiro(p.subtotal) })));
}));

rotasAdmin.patch('/pedidos/:id/status', rota(async (req, res) => {
  const id = inteiro(req.params.id, 'id', { min: 1 });
  const status = String(req.body?.status || '');
  if (!STATUS_VALIDOS.includes(status)) throw erro400('Status inválido.');

  const [atualizado] = await sql`
    UPDATE pedidos SET status = ${status}, atualizado_em = NOW() WHERE id = ${id} RETURNING *
  `;
  if (!atualizado) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json(atualizado);
}));

/* ---------------------- Conta ---------------------- */

rotasAdmin.put('/conta', rota(async (req, res) => {
  const senhaAtual = texto(req.body?.senha_atual, 'senha atual', { max: 200 });
  const novoLogin = req.body?.novo_login ? texto(req.body.novo_login, 'login', { min: 3, max: 160 }).toLowerCase() : null;
  const novaSenha = req.body?.nova_senha ? texto(req.body.nova_senha, 'nova senha', { min: 8, max: 200 }) : null;

  if (!novoLogin && !novaSenha) throw erro400('Informe um novo login ou uma nova senha.');

  const [admin] = await sql`SELECT id, email, senha_hash FROM admins WHERE id = ${req.admin.sub}`;
  if (!admin) throw new ErroHttp(401, 'Sessão inválida.');

  const ok = await bcrypt.compare(senhaAtual, admin.senha_hash);
  if (!ok) throw erro400('Senha atual incorreta.');

  const loginMudou = novoLogin && novoLogin !== admin.email;
  if (loginMudou) {
    const [existente] = await sql`SELECT id FROM admins WHERE email = ${novoLogin} AND id != ${admin.id}`;
    if (existente) throw erro400('Esse login já está em uso.');
  }

  const novoHash = novaSenha ? await gerarHashSenha(novaSenha) : admin.senha_hash;
  await sql`UPDATE admins SET email = ${novoLogin || admin.email}, senha_hash = ${novoHash} WHERE id = ${admin.id}`;

  // o cookie de sessão está atrelado ao login antigo: se ele mudou, força novo login
  if (loginMudou) {
    limparCookieSessao(res);
    return res.json({ ok: true, relogar: true });
  }
  res.json({ ok: true });
}));
