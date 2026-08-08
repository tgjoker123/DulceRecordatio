import { Router } from 'express';
import { sql } from '../db.js';
import { calcularPedido, consultarCep, opcoesDeFrete, resolverItens, validarCupom } from '../pricing.js';
import { config } from '../config.js';
import { dinheiro, rota } from '../utils.js';

export const rotasLoja = Router();

/** Catálogo público — só produtos ativos, sem expor nada de administrativo. */
rotasLoja.get('/produtos', rota(async (req, res) => {
  const produtos = await sql`
    SELECT id, nome, cat, preco, estoque, desc_curta, img, destaque
    FROM produtos
    WHERE ativo = TRUE
    ORDER BY destaque DESC, id DESC
  `;
  res.json(produtos.map((p) => ({ ...p, preco: dinheiro(p.preco) })));
}));

/** Configurações que a loja precisa saber (nada sensível aqui). */
rotasLoja.get('/config', (req, res) => {
  res.json({ freteGratisAcima: config.freteGratisAcima });
});

/** Consulta CEP + devolve as opções de envio já com preço. */
rotasLoja.post('/frete', rota(async (req, res) => {
  const { cep, itens } = req.body || {};
  const endereco = await consultarCep(cep);

  let subtotal = 0;
  if (Array.isArray(itens) && itens.length) {
    const resolvidos = await resolverItens(itens);
    subtotal = dinheiro(resolvidos.reduce((s, i) => s + i.subtotal, 0));
  }

  res.json({ endereco, opcoes: opcoesDeFrete(endereco.uf, subtotal) });
}));

/** Valida um cupom sem fechar pedido (usado pelo botão "Aplicar"). */
rotasLoja.post('/cupom/validar', rota(async (req, res) => {
  const { code, itens } = req.body || {};
  const resolvidos = await resolverItens(itens);
  const subtotal = dinheiro(resolvidos.reduce((s, i) => s + i.subtotal, 0));
  const cupom = await validarCupom(code, subtotal);
  res.json({ cupom, desconto: cupom ? dinheiro(subtotal * (cupom.discount / 100)) : 0 });
}));

/**
 * Prévia oficial da conta. O carrinho da tela usa isto sempre que muda
 * CEP, frete ou cupom — assim o cliente nunca vê um total diferente do real.
 */
rotasLoja.post('/carrinho/resumo', rota(async (req, res) => {
  const { itens, cep, freteTipo, cupom } = req.body || {};
  const resumo = await calcularPedido({ itens, cep, freteTipo, cupom });
  res.json(resumo);
}));
