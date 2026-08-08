import { config } from './config.js';

const API = 'https://api.mercadopago.com';

export function mpConfigurado() {
  return Boolean(config.mp.accessToken);
}

async function chamarMp(caminho, opcoes = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${config.mp.accessToken}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    const detalhe = corpo?.message || corpo?.error || resposta.statusText;
    throw new Error(`Mercado Pago (${resposta.status}): ${detalhe}`);
  }
  return corpo;
}

/**
 * Cria a preferência de pagamento (Checkout Pro).
 * Os valores vêm do cálculo do servidor, nunca do navegador.
 */
export async function criarPreferencia(pedido) {
  const itens = pedido.itens.map((i) => ({
    id: String(i.id),
    title: i.nome,
    quantity: i.qty,
    unit_price: Number(i.preco),
    currency_id: 'BRL',
    picture_url: i.img || undefined,
  }));

  // Frete e desconto entram como linhas próprias para o total bater exatamente.
  if (pedido.frete > 0) {
    itens.push({ id: 'frete', title: `Frete (${(pedido.frete_tipo || '').toUpperCase()})`, quantity: 1, unit_price: Number(pedido.frete), currency_id: 'BRL' });
  }
  if (pedido.desconto > 0) {
    itens.push({ id: 'desconto', title: `Desconto ${pedido.cupom || ''}`.trim(), quantity: 1, unit_price: -Number(pedido.desconto), currency_id: 'BRL' });
  }

  const body = {
    items: itens,
    external_reference: pedido.codigo,
    statement_descriptor: 'DULCERECORDATIO',
    payer: {
      name: pedido.cliente_nome,
      email: pedido.cliente_email || undefined,
      phone: { number: pedido.cliente_telefone },
      address: {
        zip_code: pedido.endereco_cep || undefined,
        street_name: pedido.endereco_rua || undefined,
      },
    },
    back_urls: {
      success: `${config.siteUrl}/?pedido=${pedido.codigo}&status=sucesso`,
      pending: `${config.siteUrl}/?pedido=${pedido.codigo}&status=pendente`,
      failure: `${config.siteUrl}/?pedido=${pedido.codigo}&status=falha`,
    },
    auto_return: 'approved',
    // O Mercado Pago avisa aqui quando o pagamento é aprovado.
    // Precisa ser uma URL pública (não funciona em localhost).
    notification_url: config.siteUrl.startsWith('http://localhost')
      ? undefined
      : `${config.siteUrl}/api/pagamentos/webhook`,
  };

  const preferencia = await chamarMp('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    preferenceId: preferencia.id,
    initPoint: preferencia.init_point || preferencia.sandbox_init_point,
  };
}

/** Consulta um pagamento pelo id (usado pelo webhook para confirmar de verdade). */
export function buscarPagamento(pagamentoId) {
  return chamarMp(`/v1/payments/${encodeURIComponent(pagamentoId)}`);
}

/** Traduz o status do Mercado Pago para o status do nosso pedido. */
export function traduzirStatus(statusMp) {
  switch (statusMp) {
    case 'approved':   return 'pago';
    case 'in_process':
    case 'pending':
    case 'authorized': return 'aguardando_pagamento';
    case 'rejected':
    case 'cancelled':  return 'cancelado';
    case 'refunded':
    case 'charged_back': return 'estornado';
    default:           return 'aguardando_pagamento';
  }
}
