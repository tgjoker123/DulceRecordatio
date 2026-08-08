import { config } from './config.js';
import { sql } from './db.js';
import { dinheiro, digitos, erro400 } from './utils.js';

/**
 * TODO cálculo de dinheiro acontece aqui, no servidor.
 *
 * O navegador manda apenas { id, qty } dos itens, o CEP e o código do cupom.
 * Preço, estoque, frete e desconto vêm sempre do banco — assim ninguém
 * consegue abrir o DevTools e comprar uma agenda por R$ 0,01.
 */

/* ---------------------- Frete ---------------------- */

const TABELA_FRETE = {
  RJ:        { pac: 14.90, sedex: 19.50, prazoPac: 4, prazoSedex: 2 },
  SP:        { pac: 19.80, sedex: 28.90, prazoPac: 6, prazoSedex: 3 },
  MG:        { pac: 19.80, sedex: 28.90, prazoPac: 6, prazoSedex: 3 },
  ES:        { pac: 19.80, sedex: 28.90, prazoPac: 6, prazoSedex: 3 },
  PR:        { pac: 24.90, sedex: 34.90, prazoPac: 8, prazoSedex: 4 },
  SC:        { pac: 24.90, sedex: 34.90, prazoPac: 8, prazoSedex: 4 },
  RS:        { pac: 24.90, sedex: 34.90, prazoPac: 9, prazoSedex: 4 },
  _default:  { pac: 29.90, sedex: 45.00, prazoPac: 12, prazoSedex: 6 },
};

export function tabelaDoEstado(uf) {
  return TABELA_FRETE[String(uf || '').toUpperCase()] || TABELA_FRETE._default;
}

/** Consulta o CEP no ViaCEP a partir do servidor (o cliente só manda os 8 dígitos). */
export async function consultarCep(cepBruto) {
  const cep = digitos(cepBruto);
  if (cep.length !== 8) throw erro400('CEP inválido. Digite os 8 números.');

  let resposta;
  try {
    resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(8000) });
  } catch {
    throw erro400('Não consegui consultar o CEP agora. Tente de novo em instantes.');
  }
  if (!resposta.ok) throw erro400('Não consegui consultar o CEP agora.');

  const dados = await resposta.json();
  if (dados.erro) throw erro400('CEP não encontrado.');

  return {
    cep,
    logradouro: dados.logradouro || '',
    bairro: dados.bairro || '',
    cidade: dados.localidade || '',
    uf: dados.uf || '',
    resumo: [dados.logradouro, dados.bairro].filter(Boolean).join(', ') +
            (dados.localidade ? ` — ${dados.localidade}/${dados.uf}` : ''),
  };
}

/** Opções de envio para um estado, já considerando a regra de frete grátis. */
export function opcoesDeFrete(uf, subtotal) {
  const t = tabelaDoEstado(uf);
  const gratis = config.freteGratisAcima > 0 && subtotal >= config.freteGratisAcima;
  return [
    { tipo: 'pac',   label: 'Correios PAC',   preco: gratis ? 0 : t.pac,   prazo: t.prazoPac,   gratis },
    { tipo: 'sedex', label: 'Correios SEDEX', preco: gratis ? 0 : t.sedex, prazo: t.prazoSedex, gratis },
  ];
}

/* ---------------------- Itens ---------------------- */

/**
 * Recebe o carrinho cru do navegador e devolve os itens com preço e nome
 * vindos do banco. Também valida estoque.
 */
export async function resolverItens(itensCrus) {
  if (!Array.isArray(itensCrus) || itensCrus.length === 0) throw erro400('Sua sacola está vazia.');
  if (itensCrus.length > 50) throw erro400('Itens demais na sacola.');

  const pedidos = new Map();
  for (const item of itensCrus) {
    const id = Number(item?.id);
    const qty = Math.trunc(Number(item?.qty));
    if (!Number.isInteger(id) || id <= 0) throw erro400('Item inválido na sacola.');
    if (!Number.isInteger(qty) || qty <= 0 || qty > 99) throw erro400('Quantidade inválida na sacola.');
    pedidos.set(id, (pedidos.get(id) || 0) + qty);
  }

  const ids = [...pedidos.keys()];
  const linhas = await sql`
    SELECT id, nome, preco, estoque, img, cat
    FROM produtos
    WHERE id = ANY(${ids}) AND ativo = TRUE
  `;

  const itens = [];
  for (const [id, qty] of pedidos) {
    const produto = linhas.find((p) => p.id === id);
    if (!produto) throw erro400('Um dos produtos da sacola não está mais disponível.');
    if (produto.estoque < qty) {
      throw erro400(`"${produto.nome}" tem apenas ${produto.estoque} em estoque.`);
    }
    const preco = dinheiro(produto.preco);
    itens.push({
      id: produto.id,
      nome: produto.nome,
      preco,
      qty,
      img: produto.img,
      subtotal: dinheiro(preco * qty),
    });
  }
  return itens;
}

/* ---------------------- Cupom ---------------------- */

/**
 * Valida o cupom contra o banco: ativo, dentro da validade, dentro do limite
 * de usos e acima do valor mínimo.
 * Devolve null quando não há cupom; lança erro quando o cupom é inválido.
 */
export async function validarCupom(codigo, subtotal) {
  const code = String(codigo || '').trim().toUpperCase();
  if (!code) return null;

  const [cupom] = await sql`SELECT * FROM cupons WHERE code = ${code}`;
  if (!cupom || !cupom.ativo) throw erro400('Cupom inválido.');
  if (cupom.validade && new Date(cupom.validade) < new Date(new Date().toDateString())) {
    throw erro400('Este cupom já expirou.');
  }
  if (cupom.max_usos !== null && cupom.usos >= cupom.max_usos) {
    throw erro400('Este cupom atingiu o limite de usos.');
  }
  if (subtotal < Number(cupom.min_subtotal)) {
    throw erro400(`Este cupom vale para compras a partir de R$ ${Number(cupom.min_subtotal).toFixed(2)}.`);
  }
  return { code: cupom.code, discount: cupom.discount };
}

/* ---------------------- Total ---------------------- */

/**
 * Fecha a conta inteira: itens + frete + cupom.
 * É o mesmo caminho usado pela prévia do carrinho e pela criação do pedido,
 * então o que o cliente vê é exatamente o que ele paga.
 */
export async function calcularPedido({ itens: itensCrus, cep, freteTipo, cupom }) {
  const itens = await resolverItens(itensCrus);
  const subtotal = dinheiro(itens.reduce((soma, i) => soma + i.subtotal, 0));

  let endereco = null;
  let frete = 0;
  let opcoes = [];

  if (cep) {
    endereco = await consultarCep(cep);
    opcoes = opcoesDeFrete(endereco.uf, subtotal);
    const escolhida = opcoes.find((o) => o.tipo === freteTipo) || opcoes[0];
    frete = escolhida.preco;
    freteTipo = escolhida.tipo;
  }

  const cupomValido = await validarCupom(cupom, subtotal);
  const desconto = cupomValido ? dinheiro(subtotal * (cupomValido.discount / 100)) : 0;
  const total = dinheiro(subtotal + frete - desconto);

  return {
    itens,
    subtotal,
    frete,
    freteTipo: cep ? freteTipo : null,
    opcoesFrete: opcoes,
    endereco,
    cupom: cupomValido,
    desconto,
    total,
    freteGratisAcima: config.freteGratisAcima,
  };
}
