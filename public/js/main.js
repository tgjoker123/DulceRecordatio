import { $, mostrarPagina, toast, debounce } from './ui.js';
import {
  estado, carregarLoja, renderProdutos, renderCarrinho, abrirCarrinho,
  abrirModalProduto, fecharModalProduto, adicionarDoModal, adicionarAoCarrinho,
  mudarQuantidade, removerDoCarrinho, calcularFrete, escolherFrete, aplicarCupom,
  irParaCheckout, preencherCheckout, finalizarPedido, mostrarConfirmacao, sincronizarResumo,
} from './loja.js';
import { configurarAdmin, carregarPainel, estaLogado, alternarNavAdmin, fazerLogin } from './admin.js';

/* ==================================================================
   ROTEADOR
   Navegação por hash: o botão "voltar" do navegador funciona de verdade.
================================================================== */
async function rotear() {
  const rota = location.hash || '#/';

  if (rota.startsWith('#/checkout')) {
    preencherCheckout();
    mostrarPagina('page-checkout');
    return;
  }

  if (rota.startsWith('#/admin')) {
    if (await estaLogado()) {
      alternarNavAdmin(true);
      mostrarPagina('page-admin');
      carregarPainel();
    } else {
      location.hash = '#/entrar';
    }
    return;
  }

  if (rota.startsWith('#/entrar')) {
    if (await estaLogado()) location.hash = '#/admin';
    else mostrarPagina('page-auth');
    return;
  }

  if (rota.startsWith('#/pedido')) {
    mostrarPagina('page-obrigado');
    return;
  }

  mostrarPagina('page-loja');
}

/* ==================================================================
   EVENTOS DA LOJA
================================================================== */
function configurarLoja() {
  // Catálogo (delegação: os cartões são recriados a cada render)
  $('#shop-container').addEventListener('click', (evento) => {
    const botaoAdd = evento.target.closest('[data-add]');
    if (botaoAdd) {
      evento.stopPropagation();
      adicionarAoCarrinho(Number(botaoAdd.dataset.add));
      return;
    }
    const cartao = evento.target.closest('[data-produto]');
    if (cartao) abrirModalProduto(Number(cartao.dataset.produto));
  });

  $('#shop-container').addEventListener('keydown', (evento) => {
    if (evento.key !== 'Enter' && evento.key !== ' ') return;
    const cartao = evento.target.closest('[data-produto]');
    if (cartao) {
      evento.preventDefault();
      abrirModalProduto(Number(cartao.dataset.produto));
    }
  });

  // Busca e categorias
  $('#shop-search').addEventListener('input', debounce((evento) => {
    estado.busca = evento.target.value;
    renderProdutos();
  }, 200));

  $('#cat-container').addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-cat]');
    if (!botao) return;
    document.querySelectorAll('#cat-container .cat-card').forEach((c) => c.classList.remove('active'));
    botao.classList.add('active');
    estado.categoria = botao.dataset.cat;
    renderProdutos();
  });

  $('[data-ir-produtos]').addEventListener('click', () => {
    $('#shop-anchor').scrollIntoView({ behavior: 'smooth' });
  });

  // Modal
  $('#modal-add').addEventListener('click', adicionarDoModal);
  $('[data-fechar-modal]').addEventListener('click', fecharModalProduto);
  $('#product-modal').addEventListener('click', (evento) => {
    if (evento.target.id === 'product-modal') fecharModalProduto();
  });

  // Carrinho
  $('[data-abrir-carrinho]').addEventListener('click', () => abrirCarrinho(true));
  $('[data-fechar-carrinho]').addEventListener('click', () => abrirCarrinho(false));
  $('#cart-overlay').addEventListener('click', () => abrirCarrinho(false));

  $('#cart-items-list').addEventListener('click', (evento) => {
    const passo = evento.target.closest('[data-qty]');
    if (passo) return mudarQuantidade(Number(passo.dataset.qty), Number(passo.dataset.delta));

    const remover = evento.target.closest('[data-remover]');
    if (remover) return removerDoCarrinho(Number(remover.dataset.remover));
  });

  $('#btn-calcular-frete').addEventListener('click', calcularFrete);
  $('#cart-cep-input').addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') calcularFrete();
  });
  $('#shipping-options').addEventListener('change', (evento) => {
    if (evento.target.name === 'shipping-choice') escolherFrete(evento.target.value);
  });

  $('#btn-aplicar-cupom').addEventListener('click', aplicarCupom);
  $('#cart-coupon-input').addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') aplicarCupom();
  });

  $('#btn-ir-checkout').addEventListener('click', irParaCheckout);
  $('#btn-pagar').addEventListener('click', finalizarPedido);

  // Esc fecha o que estiver aberto
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape') return;
    if ($('#product-modal').classList.contains('show')) fecharModalProduto();
    else if ($('#cart-sidebar').classList.contains('open')) abrirCarrinho(false);
  });
}

/* ==================================================================
   LOGIN
================================================================== */
function configurarLogin() {
  $('#form-login').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const msg = $('#login-msg');
    const botao = evento.target.querySelector('button[type="submit"]');

    msg.textContent = '';
    botao.disabled = true;

    try {
      await fazerLogin($('#login-user').value.trim(), $('#login-pass').value);
      $('#login-pass').value = '';
      toast('Bem-vinda de volta!');
      location.hash = '#/admin';
    } catch (erro) {
      msg.textContent = erro.message;
    } finally {
      botao.disabled = false;
    }
  });
}

/* ==================================================================
   RETORNO DO MERCADO PAGO
   O Mercado Pago devolve o cliente em /?pedido=DR-XXXX&status=sucesso
================================================================== */
function tratarRetornoPagamento() {
  const parametros = new URLSearchParams(location.search);
  const codigo = parametros.get('pedido');
  if (!codigo) return false;

  const situacao = parametros.get('status') || 'pendente';
  // Limpa a URL para o cliente não reenviar o mesmo retorno ao atualizar a página.
  history.replaceState(null, '', location.pathname + '#/pedido');
  mostrarConfirmacao(codigo, situacao);
  return true;
}

/* ==================================================================
   INICIALIZAÇÃO
================================================================== */
async function iniciar() {
  $('#ano-atual').textContent = new Date().getFullYear();

  configurarLoja();
  configurarLogin();
  configurarAdmin();

  renderCarrinho();
  window.addEventListener('hashchange', rotear);

  await carregarLoja();
  if (estado.carrinho.length) sincronizarResumo();

  estaLogado().then(alternarNavAdmin);

  if (!tratarRetornoPagamento()) await rotear();
}

iniciar();
