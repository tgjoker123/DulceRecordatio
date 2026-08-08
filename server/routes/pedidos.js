import { Router } from 'express';
import { sql, transacao } from '../db.js';
import { calcularPedido } from '../pricing.js';
import { criarPreferencia, mpConfigurado, buscarPagamento, traduzirStatus } from '../mercadopago.js';
import { config } from '../config.js';
import { digitos, gerarCodigoPedido, rota, texto, textoOpcional } from '../utils.js';

export const rotasPedidos = Router();

/**
 * Cria o pedido e devolve o checkout do Mercado Pago.
 *
 * O pedido nasce como "aguardando_pagamento" e SÓ vira "pago" quando o
 * Mercado Pago confirma pelo webhook. Ninguém marca pedido como pago
 * a partir do navegador.
 */
rotasPedidos.post('/pedidos', rota(async (req, res) => {
  const corpo = req.body || {};

  const cliente = {
    nome: texto(corpo.cliente?.nome, 'nome', { min: 3, max: 120 }),
    telefone: digitos(corpo.cliente?.telefone),
    email: textoOpcional(corpo.cliente?.email, 160),
  };
  if (cliente.telefone.length < 10) {
    return res.status(400).json({ erro: 'Informe um WhatsApp válido com DDD.' });
  }

  const endereco = {
    cep: digitos(corpo.endereco?.cep),
    rua: texto(corpo.endereco?.rua, 'endereço', { min: 5, max: 200 }),
    bairro: textoOpcional(corpo.endereco?.bairro, 120),
  };

  // Conta refeita do zero com os preços do banco.
  const calculo = await calcularPedido({
    itens: corpo.itens,
    cep: endereco.cep,
    freteTipo: corpo.freteTipo,
    cupom: corpo.cupom,
  });

  if (!calculo.endereco) {
    return res.status(400).json({ erro: 'Calcule o frete antes de finalizar.' });
  }

  const codigo = gerarCodigoPedido();
  const cidade = `${calculo.endereco.cidade}/${calculo.endereco.uf}`;

  const [pedido] = await sql`
    INSERT INTO pedidos (
      codigo, cliente_nome, cliente_telefone, cliente_email,
      endereco_cep, endereco_rua, endereco_bairro, endereco_cidade,
      itens, subtotal, frete, frete_tipo, desconto, cupom, total, status
    ) VALUES (
      ${codigo}, ${cliente.nome}, ${cliente.telefone}, ${cliente.email || null},
      ${endereco.cep}, ${endereco.rua}, ${endereco.bairro}, ${cidade},
      ${JSON.stringify(calculo.itens)}, ${calculo.subtotal}, ${calculo.frete}, ${calculo.freteTipo},
      ${calculo.desconto}, ${calculo.cupom?.code || null}, ${calculo.total}, 'aguardando_pagamento'
    )
    RETURNING *
  `;

  // Sem token do Mercado Pago configurado: pedido fica salvo e o cliente
  // é mandado para o link de pagamento estático.
  if (!mpConfigurado()) {
    return res.json({
      codigo: pedido.codigo,
      total: calculo.total,
      fallbackUrl: config.mp.linkFallback || null,
      aviso: 'Checkout Pro não configurado (MP_ACCESS_TOKEN vazio).',
    });
  }

  try {
    const { preferenceId, initPoint } = await criarPreferencia(pedido);
    await sql`UPDATE pedidos SET preference_id = ${preferenceId}, atualizado_em = NOW() WHERE id = ${pedido.id}`;
    res.json({ codigo: pedido.codigo, total: calculo.total, preferenceId, initPoint });
  } catch (erro) {
    console.error('[mercadopago] falha ao criar preferência:', erro.message);
    res.json({
      codigo: pedido.codigo,
      total: calculo.total,
      fallbackUrl: config.mp.linkFallback || null,
      aviso: 'Não consegui abrir o checkout automático.',
    });
  }
}));

/** Status público de um pedido, pelo código (usado na tela de obrigado). */
rotasPedidos.get('/pedidos/:codigo/status', rota(async (req, res) => {
  const [pedido] = await sql`
    SELECT codigo, status, total, criado_em FROM pedidos WHERE codigo = ${String(req.params.codigo).toUpperCase()}
  `;
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado.' });
  res.json(pedido);
}));

/* ==================================================================
   WEBHOOK DO MERCADO PAGO
   É aqui que o pedido vira "pago" de verdade. Sempre respondemos 200
   rápido: se der erro do nosso lado, o Mercado Pago reenvia depois.
================================================================== */
rotasPedidos.post('/pagamentos/webhook', async (req, res) => {
  res.sendStatus(200);

  try {
    const tipo = req.body?.type || req.query.type || req.query.topic;
    const pagamentoId = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (tipo !== 'payment' || !pagamentoId) return;
    if (!mpConfigurado()) return;

    const pagamento = await buscarPagamento(pagamentoId);
    const codigo = pagamento.external_reference;
    if (!codigo) return;

    const novoStatus = traduzirStatus(pagamento.status);
    const [pedido] = await sql`SELECT * FROM pedidos WHERE codigo = ${codigo}`;
    if (!pedido) return;

    await sql`
      UPDATE pedidos
      SET status = ${novoStatus}, pagamento_id = ${String(pagamentoId)}, atualizado_em = NOW()
      WHERE id = ${pedido.id}
    `;

    // Baixa de estoque acontece uma única vez, quando o pagamento é aprovado.
    if (novoStatus === 'pago' && !pedido.estoque_baixado) {
      const itens = Array.isArray(pedido.itens) ? pedido.itens : JSON.parse(pedido.itens || '[]');
      const comandos = itens.map(
        (i) => sql`UPDATE produtos SET estoque = GREATEST(estoque - ${i.qty}, 0), atualizado_em = NOW() WHERE id = ${i.id}`
      );
      comandos.push(sql`UPDATE pedidos SET estoque_baixado = TRUE WHERE id = ${pedido.id}`);
      if (pedido.cupom) {
        comandos.push(sql`UPDATE cupons SET usos = usos + 1 WHERE code = ${pedido.cupom}`);
      }
      await transacao(comandos);
    }

    console.log(`[webhook] pedido ${codigo} -> ${novoStatus}`);
  } catch (erro) {
    console.error('[webhook] erro:', erro.message);
  }
});
