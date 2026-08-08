import { api } from './api.js';
import { $, brl, esc, toast, mostrarPagina, debounce, CATEGORIAS } from './ui.js';

const CHAVE_CARRINHO = 'dulce_carrinho_v2';

/* ==================================================================
   ESTADO
   O carrinho guarda só { id, qty }. Preço, nome e estoque vêm sempre
   do servidor — assim um produto que mudou de preço não fica "preso"
   no navegador do cliente.
================================================================== */
export const estado = {
  produtos: [],
  carrinho: lerCarrinhoSalvo(),
  categoria: 'todos',
  busca: '',
  cep: '',
  freteTipo: null,
  opcoesFrete: [],
  endereco: null,
  cupom: '',
  resumo: null,          // conta oficial devolvida pelo servidor
  config: { freteGratisAcima: 0 },
};

function lerCarrinhoSalvo() {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_CARRINHO) || '[]');
    return bruto
      .filter((i) => Number.isInteger(i?.id) && Number.isInteger(i?.qty) && i.qty > 0)
      .map((i) => ({ id: i.id, qty: Math.min(i.qty, 99) }));
  } catch {
    return [];
  }
}

function salvarCarrinho() {
  localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(estado.carrinho));
}

const produtoPorId = (id) => estado.produtos.find((p) => p.id === id);

/* ==================================================================
   CATÁLOGO
================================================================== */
export async function carregarLoja() {
  const container = $('#shop-container');
  container.innerHTML = Array.from({ length: 4 }, () =>
    `<div class="skeleton"><div class="sk-img"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`
  ).join('');

  try {
    const [produtos, config] = await Promise.all([api.produtos(), api.config()]);
    estado.produtos = produtos;
    estado.config = config;
    // Remove do carrinho o que saiu do ar entre uma visita e outra.
    estado.carrinho = estado.carrinho.filter((i) => produtoPorId(i.id));
    salvarCarrinho();
    renderProdutos();
    renderCarrinho();
  } catch (erro) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-plug-circle-xmark"></i>
      Não consegui carregar os produtos.<br><small>${esc(erro.message)}</small></div>`;
  }
}

export function renderProdutos() {
  const container = $('#shop-container');
  const busca = estado.busca.toLowerCase().trim();

  const lista = estado.produtos.filter((p) => {
    const naCategoria = estado.categoria === 'todos' || p.cat === estado.categoria;
    const noTexto = !busca ||
      p.nome.toLowerCase().includes(busca) ||
      (p.desc_curta || '').toLowerCase().includes(busca);
    return naCategoria && noTexto;
  });

  if (!lista.length) {
    container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i>
      Nada encontrado por aqui.<br><small>Tente outra busca ou veja todas as categorias.</small></div>`;
    return;
  }

  container.innerHTML = lista.map((p) => {
    const estoque = Number(p.estoque) || 0;
    const esgotado = estoque === 0;
    const tagEstoque = esgotado
      ? '<span class="tag tag-stock out">Esgotado</span>'
      : estoque <= 3 ? `<span class="tag tag-stock low">Últimas ${estoque}</span>` : '';

    return `
      <article class="product-card" data-produto="${p.id}" tabindex="0" role="button" aria-label="Ver ${esc(p.nome)}">
        <div class="img-wrap">
          <img src="${esc(p.img)}" alt="${esc(p.nome)}" loading="lazy"
               onerror="this.style.visibility='hidden'">
          ${tagEstoque}
          ${p.destaque && !esgotado ? '<span class="tag tag-featured">★ Destaque</span>' : ''}
        </div>
        <div class="product-details">
          <span class="cat-label">${esc(CATEGORIAS[p.cat] || p.cat)}</span>
          <h4>${esc(p.nome)}</h4>
          <div class="product-footer">
            <span class="product-price">${brl(p.preco)}</span>
            <button type="button" class="add-to-cart-btn" data-add="${p.id}" ${esgotado ? 'disabled' : ''}
                    aria-label="Adicionar ${esc(p.nome)} à sacola">
              <i class="fa-solid ${esgotado ? 'fa-ban' : 'fa-plus'}"></i>
            </button>
          </div>
        </div>
      </article>`;
  }).join('');
}

/* ==================================================================
   MODAL DE PRODUTO
================================================================== */
let produtoNoModal = null;

export function abrirModalProduto(id) {
  const p = produtoPorId(id);
  if (!p) return;
  produtoNoModal = p;

  const estoque = Number(p.estoque) || 0;
  $('#modal-product-img').src = p.img || '';
  $('#modal-product-img').alt = p.nome;
  $('#modal-product-cat').textContent = CATEGORIAS[p.cat] || p.cat;
  $('#modal-product-title').textContent = p.nome;
  $('#modal-product-price').textContent = brl(p.preco);
  $('#modal-product-desc').textContent = p.desc_curta || 'Sem descrição.';

  const elEstoque = $('#modal-product-stock');
  elEstoque.textContent = estoque === 0 ? 'Esgotado no momento' : `${estoque} em estoque`;
  elEstoque.style.color = estoque === 0 ? 'var(--danger)' : 'var(--mint-deep)';

  const botao = $('#modal-add');
  botao.disabled = estoque === 0;
  botao.innerHTML = estoque === 0
    ? '<i class="fa-solid fa-ban"></i> Esgotado'
    : '<i class="fa-solid fa-basket-shopping"></i> Adicionar à sacola';

  $('#product-modal').classList.add('show');
}

export function fecharModalProduto() {
  $('#product-modal').classList.remove('show');
  produtoNoModal = null;
}

export function adicionarDoModal() {
  if (produtoNoModal) {
    adicionarAoCarrinho(produtoNoModal.id);
    fecharModalProduto();
  }
}

/* ==================================================================
   CARRINHO
================================================================== */
export function abrirCarrinho(abrir = true) {
  $('#cart-sidebar').classList.toggle('open', abrir);
  $('#cart-overlay').classList.toggle('show', abrir);
}

export function adicionarAoCarrinho(id) {
  const produto = produtoPorId(id);
  if (!produto) return;

  const estoque = Number(produto.estoque) || 0;
  const linha = estado.carrinho.find((i) => i.id === id);
  const quantidadeAtual = linha ? linha.qty : 0;

  if (quantidadeAtual >= estoque) {
    toast(`Só temos ${estoque} unidade(s) de "${produto.nome}".`, 'aviso');
    return;
  }

  if (linha) linha.qty++;
  else estado.carrinho.push({ id, qty: 1 });

  salvarCarrinho();
  renderCarrinho();
  sincronizarResumo();
  toast('Item adicionado à sacola!');
}

export function mudarQuantidade(id, delta) {
  const linha = estado.carrinho.find((i) => i.id === id);
  if (!linha) return;
  const estoque = Number(produtoPorId(id)?.estoque) || 0;

  const nova = linha.qty + delta;
  if (nova <= 0) return removerDoCarrinho(id);
  if (nova > estoque) return toast(`Estoque máximo: ${estoque}.`, 'aviso');

  linha.qty = nova;
  salvarCarrinho();
  renderCarrinho();
  sincronizarResumo();
}

export function removerDoCarrinho(id) {
  estado.carrinho = estado.carrinho.filter((i) => i.id !== id);
  salvarCarrinho();
  renderCarrinho();
  sincronizarResumo();
}

/** Soma local — só para a tela reagir na hora. O valor final é o do servidor. */
function subtotalLocal() {
  return estado.carrinho.reduce((soma, linha) => {
    const p = produtoPorId(linha.id);
    return soma + (p ? Number(p.preco) * linha.qty : 0);
  }, 0);
}

export function renderCarrinho() {
  const lista = $('#cart-items-list');
  const quantidade = estado.carrinho.reduce((s, i) => s + i.qty, 0);
  $('#cart-badge').textContent = quantidade;

  if (!estado.carrinho.length) {
    lista.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-basket-shopping"></i>Sua sacola está vazia.</div>`;
  } else {
    lista.innerHTML = estado.carrinho.map((linha) => {
      const p = produtoPorId(linha.id);
      if (!p) return '';
      return `
        <div class="cart-line">
          <img src="${esc(p.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
          <div class="cart-line-info">
            <b>${esc(p.nome)}</b>
            <small>${brl(p.preco)} cada</small>
            <div class="qty-stepper">
              <button type="button" data-qty="${p.id}" data-delta="-1" aria-label="Diminuir">−</button>
              <span>${linha.qty}</span>
              <button type="button" data-qty="${p.id}" data-delta="1" aria-label="Aumentar">+</button>
            </div>
          </div>
          <button type="button" data-remover="${p.id}" style="background:none;border:none;color:var(--danger);cursor:pointer;" aria-label="Remover ${esc(p.nome)}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>`;
    }).join('');
  }

  const subtotal = estado.resumo?.subtotal ?? subtotalLocal();
  const frete = estado.resumo?.frete ?? 0;
  const desconto = estado.resumo?.desconto ?? 0;
  const total = estado.resumo?.total ?? subtotal;

  $('#cart-subtotal').textContent = brl(subtotal);
  $('#cart-shipping').textContent = estado.endereco ? brl(frete) : 'a calcular';
  $('#cart-discount').textContent = `- ${brl(desconto)}`;
  $('#cart-total').textContent = brl(total);

  renderAvisoFreteGratis(subtotal);
}

function renderAvisoFreteGratis(subtotal) {
  const aviso = $('#frete-gratis-aviso');
  const limite = Number(estado.config.freteGratisAcima) || 0;

  if (!limite || !estado.carrinho.length) {
    aviso.hidden = true;
    return;
  }
  aviso.hidden = false;
  aviso.textContent = subtotal >= limite
    ? '🎉 Você ganhou frete grátis!'
    : `Faltam ${brl(limite - subtotal)} para ganhar frete grátis`;
}

/**
 * Pede ao servidor a conta oficial (preço, estoque, frete e cupom).
 * É o que garante que o valor da tela é o mesmo valor cobrado.
 */
export const sincronizarResumo = debounce(async () => {
  if (!estado.carrinho.length) {
    estado.resumo = null;
    renderCarrinho();
    return;
  }
  try {
    estado.resumo = await api.resumoCarrinho({
      itens: estado.carrinho,
      cep: estado.cep || undefined,
      freteTipo: estado.freteTipo || undefined,
      cupom: estado.cupom || undefined,
    });
    if (estado.resumo.opcoesFrete?.length) estado.opcoesFrete = estado.resumo.opcoesFrete;
    renderCarrinho();
    renderOpcoesFrete();
  } catch (erro) {
    // Cupom que expirou ou item que esgotou enquanto o carrinho estava aberto.
    if (estado.cupom) {
      estado.cupom = '';
      $('#coupon-message').textContent = erro.message;
      $('#coupon-message').className = 'hint err';
      sincronizarResumo();
    } else {
      toast(erro.message, 'aviso');
    }
  }
}, 250);

/* ==================================================================
   FRETE
================================================================== */
export async function calcularFrete() {
  const cep = $('#cart-cep-input').value.replace(/\D/g, '');
  const info = $('#cep-info-text');

  if (cep.length !== 8) {
    info.textContent = 'Digite os 8 números do CEP.';
    info.className = 'hint err';
    return;
  }
  if (!estado.carrinho.length) {
    info.textContent = 'Adicione um produto antes de calcular o frete.';
    info.className = 'hint err';
    return;
  }

  info.textContent = 'Consultando...';
  info.className = 'hint';

  try {
    const { endereco, opcoes } = await api.frete({ cep, itens: estado.carrinho });
    estado.cep = endereco.cep;
    estado.endereco = endereco;
    estado.opcoesFrete = opcoes;
    estado.freteTipo = estado.freteTipo || 'pac';

    info.textContent = `📦 Enviar para ${endereco.cidade} - ${endereco.uf}`;
    info.className = 'hint ok';
    renderOpcoesFrete();
    sincronizarResumo();
  } catch (erro) {
    info.textContent = erro.message;
    info.className = 'hint err';
  }
}

function renderOpcoesFrete() {
  const caixa = $('#shipping-options');
  if (!estado.opcoesFrete.length) {
    caixa.classList.remove('show');
    return;
  }
  caixa.classList.add('show');
  caixa.innerHTML = estado.opcoesFrete.map((o) => `
    <label>
      <span>
        <input type="radio" name="shipping-choice" value="${o.tipo}" ${estado.freteTipo === o.tipo ? 'checked' : ''}>
        ${esc(o.label)}
        <small>chega em até ${o.prazo} dias úteis</small>
      </span>
      <b style="color:var(--coral);">${o.preco === 0 ? 'Grátis' : brl(o.preco)}</b>
    </label>`).join('');
}

export function escolherFrete(tipo) {
  estado.freteTipo = tipo;
  sincronizarResumo();
}

/* ==================================================================
   CUPOM
================================================================== */
export async function aplicarCupom() {
  const codigo = $('#cart-coupon-input').value.trim().toUpperCase();
  const msg = $('#coupon-message');

  if (!codigo) {
    estado.cupom = '';
    msg.textContent = '';
    sincronizarResumo();
    return;
  }
  if (!estado.carrinho.length) {
    msg.textContent = 'Adicione produtos antes de aplicar um cupom.';
    msg.className = 'hint err';
    return;
  }

  try {
    const { cupom } = await api.validarCupom({ code: codigo, itens: estado.carrinho });
    estado.cupom = cupom.code;
    msg.textContent = `Cupom ${cupom.code} (${cupom.discount}%) aplicado!`;
    msg.className = 'hint ok';
    sincronizarResumo();
  } catch (erro) {
    estado.cupom = '';
    msg.textContent = erro.message;
    msg.className = 'hint err';
    sincronizarResumo();
  }
}

/* ==================================================================
   CHECKOUT
================================================================== */
export function irParaCheckout() {
  if (!estado.carrinho.length) return toast('Sua sacola está vazia!', 'aviso');
  if (!estado.endereco) {
    toast('Calcule o frete antes de continuar.', 'aviso');
    $('#cart-cep-input').focus();
    return;
  }

  abrirCarrinho(false);
  location.hash = '#/checkout';
}

export function preencherCheckout() {
  if (!estado.carrinho.length || !estado.endereco) {
    location.hash = '#/';
    return;
  }

  $('#chk-cidade').value = `${estado.endereco.cidade}/${estado.endereco.uf}`;
  if (!$('#chk-bairro').value) $('#chk-bairro').value = estado.endereco.bairro || '';
  if (!$('#chk-rua').value && estado.endereco.logradouro) $('#chk-rua').value = estado.endereco.logradouro;

  const itens = estado.resumo?.itens || estado.carrinho.map((l) => {
    const p = produtoPorId(l.id);
    return { nome: p?.nome, preco: p?.preco, qty: l.qty, img: p?.img };
  });

  $('#checkout-summary-items').innerHTML = itens.map((i) => `
    <div class="summary-item">
      <img src="${esc(i.img)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
      <div class="summary-item-info"><b>${esc(i.nome)}</b><small>${i.qty}x ${brl(i.preco)}</small></div>
    </div>`).join('');

  const r = estado.resumo;
  const opcao = estado.opcoesFrete.find((o) => o.tipo === estado.freteTipo);
  $('#chk-frete-label').textContent = opcao ? `Frete (${opcao.label})` : 'Frete';
  $('#chk-subtotal').textContent = brl(r?.subtotal ?? subtotalLocal());
  $('#chk-shipping').textContent = r?.frete === 0 ? 'Grátis' : brl(r?.frete ?? 0);
  $('#chk-discount').textContent = `- ${brl(r?.desconto ?? 0)}`;
  $('#chk-total').textContent = brl(r?.total ?? subtotalLocal());

  resetarEtapas();
}

function resetarEtapas() {
  const entrega = $('#step-entrega');
  entrega.className = 'step-item active';
  entrega.innerHTML = '<span class="step-circle">2</span>Entrega';
  $('#step-pagamento').className = 'step-item';
}

export async function finalizarPedido() {
  const botao = $('#btn-pagar');
  const dados = {
    itens: estado.carrinho,
    cliente: {
      nome: $('#chk-nome').value.trim(),
      telefone: $('#chk-tel').value.trim(),
      email: $('#chk-email').value.trim(),
    },
    endereco: {
      cep: estado.cep,
      rua: $('#chk-rua').value.trim(),
      bairro: $('#chk-bairro').value.trim(),
    },
    freteTipo: estado.freteTipo,
    cupom: estado.cupom || undefined,
  };

  if (!dados.cliente.nome || !dados.cliente.telefone || !dados.endereco.rua) {
    return toast('Preencha nome, WhatsApp e endereço.', 'aviso');
  }

  const textoOriginal = botao.innerHTML;
  botao.disabled = true;
  botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando checkout seguro...';

  try {
    const resposta = await api.criarPedido(dados);
    const destino = resposta.initPoint || resposta.fallbackUrl;

    if (!destino) {
      toast('Pedido registrado, mas o pagamento online está indisponível. Vamos te chamar no WhatsApp!', 'aviso');
      concluirPedidoLocal(resposta.codigo);
      return;
    }

    // O pedido já está salvo no banco: pode limpar a sacola com segurança.
    localStorage.setItem('dulce_ultimo_pedido', resposta.codigo);
    estado.carrinho = [];
    salvarCarrinho();

    $('#step-entrega').className = 'step-item done';
    $('#step-entrega').innerHTML = '<span class="step-circle"><i class="fa-solid fa-check"></i></span>Entrega';
    $('#step-pagamento').className = 'step-item active';

    window.location.href = destino;
  } catch (erro) {
    toast(erro.message, 'erro');
    botao.disabled = false;
    botao.innerHTML = textoOriginal;
  }
}

function concluirPedidoLocal(codigo) {
  estado.carrinho = [];
  salvarCarrinho();
  renderCarrinho();
  mostrarConfirmacao(codigo, 'pendente');
  location.hash = '#/pedido';
}

/* ==================================================================
   PÁGINA DE CONFIRMAÇÃO
================================================================== */
export async function mostrarConfirmacao(codigo, situacao) {
  const icone = $('#obrigado-icon');
  const titulo = $('#obrigado-titulo');
  const texto = $('#obrigado-texto');
  const elCodigo = $('#obrigado-codigo');

  if (codigo) {
    elCodigo.hidden = false;
    elCodigo.textContent = codigo;
  } else {
    elCodigo.hidden = true;
  }

  const cenarios = {
    sucesso: {
      icone: 'fa-circle-check', cor: 'var(--mint-deep)', titulo: 'Pagamento aprovado!',
      texto: 'Recebemos seu pagamento e já vamos preparar tudo com muito carinho. Você recebe novidades pelo WhatsApp.',
    },
    pendente: {
      icone: 'fa-clock', cor: 'var(--amber)', titulo: 'Pagamento em análise',
      texto: 'Assim que o pagamento for confirmado a gente começa a preparar seu pedido. Se pagou por Pix, costuma levar poucos minutos.',
    },
    falha: {
      icone: 'fa-circle-xmark', cor: 'var(--danger)', titulo: 'O pagamento não foi concluído',
      texto: 'Seu pedido ficou guardado. Chame a gente no WhatsApp que resolvemos juntinho.',
    },
  };

  const cenario = cenarios[situacao] || cenarios.pendente;
  icone.className = `fa-solid ${cenario.icone}`;
  icone.style.color = cenario.cor;
  titulo.textContent = cenario.titulo;
  texto.textContent = cenario.texto;

  // Confirma o status real no banco (o retorno do Mercado Pago é só uma pista).
  if (codigo) {
    try {
      const pedido = await api.statusPedido(codigo);
      if (pedido.status === 'pago') {
        icone.className = 'fa-solid fa-circle-check';
        icone.style.color = 'var(--mint-deep)';
        titulo.textContent = 'Pagamento confirmado!';
        texto.textContent = cenarios.sucesso.texto;
      }
    } catch { /* sem status: mantém a mensagem otimista */ }
  }

  mostrarPagina('page-obrigado');
}
