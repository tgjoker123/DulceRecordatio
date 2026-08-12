import { api } from './api.js';
import { $, brl, esc, toast, pill, CATEGORIAS } from './ui.js';

const painel = {
  produtos: [],
  cupons: [],
  pedidos: [],
  filtroStatus: '',
};

/* ==================================================================
   SESSÃO
================================================================== */
export async function estaLogado() {
  try {
    await api.me();
    return true;
  } catch {
    return false;
  }
}

export function alternarNavAdmin(logado) {
  $('#nav-admin').hidden = !logado;
  $('#nav-login').hidden = logado;
}

export async function fazerLogin(email, senha) {
  await api.login({ email, senha });
  alternarNavAdmin(true);
}

export async function sair() {
  await api.logout();
  alternarNavAdmin(false);
  toast('Você saiu do painel.');
  location.hash = '#/';
}

/* ==================================================================
   CARGA DO PAINEL
================================================================== */
export async function carregarPainel() {
  await Promise.all([carregarResumo(), carregarPedidos(), carregarProdutos(), carregarCupons()]);
}

async function carregarResumo() {
  try {
    const r = await api.admin.resumo();
    $('#admin-stats').innerHTML = `
      <div class="stat-card destaque"><i class="fa-solid fa-sack-dollar"></i><div class="rotulo">Receita confirmada</div><div class="valor">${brl(r.receita)}</div></div>
      <div class="stat-card"><i class="fa-solid fa-box-open"></i><div class="rotulo">Pedidos pagos</div><div class="valor">${r.pedidosPagos}</div></div>
      <div class="stat-card"><i class="fa-solid fa-hourglass-half"></i><div class="rotulo">Aguardando pagamento</div><div class="valor">${r.pedidosPendentes}</div></div>
      <div class="stat-card ${r.produtosSemEstoque ? 'alerta' : ''}"><i class="fa-solid fa-triangle-exclamation"></i><div class="rotulo">Sem estoque</div><div class="valor">${r.produtosSemEstoque}</div></div>
      <div class="stat-card"><i class="fa-solid fa-store"></i><div class="rotulo">Produtos ativos</div><div class="valor">${r.produtosAtivos}</div></div>`;
  } catch (erro) {
    $('#admin-stats').innerHTML = `<div class="stat-card"><div class="rotulo">Resumo</div><div class="valor" style="font-size:.9rem;">${esc(erro.message)}</div></div>`;
  }
}

/* ---------------------- Pedidos ---------------------- */
async function carregarPedidos() {
  const corpo = $('#admin-pedidos-list');
  corpo.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:20px;">Carregando...</td></tr>`;
  try {
    painel.pedidos = await api.admin.pedidos(painel.filtroStatus);
    renderPedidos();
  } catch (erro) {
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--danger); padding:20px;">${esc(erro.message)}</td></tr>`;
  }
}

function renderPedidos() {
  const corpo = $('#admin-pedidos-list');
  if (!painel.pedidos.length) {
    corpo.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--muted); padding:20px;">Nenhum pedido por aqui ainda.</td></tr>`;
    return;
  }

  corpo.innerHTML = painel.pedidos.map((p) => {
    const itens = Array.isArray(p.itens) ? p.itens : [];
    const data = new Date(p.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const endereco = [p.endereco_rua, p.endereco_bairro, p.endereco_cidade].filter(Boolean).join(', ');

    const acoes = [];
    if (p.status === 'pago') acoes.push(`<button class="btn btn-sm btn-mint" data-enviar="${p.id}">Marcar enviado</button>`);
    if (p.status === 'enviado') acoes.push(`<button class="btn btn-sm btn-ghost" data-entregue="${p.id}">Marcar entregue</button>`);
    acoes.push(`<button class="btn btn-sm btn-ghost" data-whats="${p.id}" title="Falar no WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>`);

    return `
      <tr>
        <td><b>${esc(p.codigo)}</b><br><small style="color:var(--muted)">${data}</small></td>
        <td>${esc(p.cliente_nome)}<br><small style="color:var(--muted)">${esc(p.cliente_telefone)}</small></td>
        <td style="font-size:.78rem; max-width:200px;">${esc(endereco)}<br><small>CEP ${esc(p.endereco_cep || '')} · ${esc((p.frete_tipo || '').toUpperCase())}</small></td>
        <td style="font-size:.78rem;">${itens.map((i) => `${i.qty}x ${esc(i.nome)}`).join('<br>')}</td>
        <td><b>${brl(p.total)}</b>${p.cupom ? `<br><small style="color:var(--coral)">${esc(p.cupom)}</small>` : ''}</td>
        <td>${pill(p.status)}</td>
        <td style="white-space:nowrap;">${acoes.join(' ')}</td>
      </tr>`;
  }).join('');
}

async function mudarStatusPedido(id, status) {
  try {
    await api.admin.mudarStatus(id, status);
    toast('Pedido atualizado!');
    await Promise.all([carregarPedidos(), carregarResumo()]);
  } catch (erro) {
    toast(erro.message, 'erro');
  }
}

function abrirWhatsApp(pedido, mensagem) {
  const telefone = String(pedido.cliente_telefone || '').replace(/\D/g, '');
  const numero = telefone.length <= 11 ? `55${telefone}` : telefone;
  window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`, '_blank', 'noopener');
}

/* ---------------------- Produtos ---------------------- */
async function carregarProdutos() {
  try {
    painel.produtos = await api.admin.produtos();
    renderProdutosAdmin();
  } catch (erro) {
    $('#admin-products-list').innerHTML = `<tr><td colspan="6" style="color:var(--danger); padding:16px;">${esc(erro.message)}</td></tr>`;
  }
}

function renderProdutosAdmin() {
  const corpo = $('#admin-products-list');
  if (!painel.produtos.length) {
    corpo.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">Nenhum produto cadastrado.</td></tr>`;
    return;
  }
  corpo.innerHTML = painel.produtos.map((p) => `
    <tr>
      <td><b>${esc(p.nome)}</b>${p.destaque ? ' <span style="color:var(--coral)">★</span>' : ''}</td>
      <td>${esc(CATEGORIAS[p.cat] || p.cat)}</td>
      <td>${brl(p.preco)}</td>
      <td style="color:${p.estoque === 0 ? 'var(--danger)' : 'inherit'}">${p.estoque}</td>
      <td>${p.ativo ? '<span class="pill" style="color:var(--mint-deep);background:var(--mint-soft)">Visível</span>' : '<span class="pill" style="color:var(--muted);background:var(--line)">Oculto</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="action-icon edit" data-editar-produto="${p.id}" aria-label="Editar"><i class="fa-solid fa-pen"></i></button>
        <button class="action-icon delete" data-excluir-produto="${p.id}" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

function lerFormularioProduto() {
  return {
    nome: $('#form-nome').value.trim(),
    cat: $('#form-cat').value,
    preco: Number($('#form-preco').value),
    estoque: Number($('#form-estoque').value) || 0,
    desc_curta: $('#form-desc').value.trim(),
    img: $('#form-img').value.trim(),
    ativo: $('#form-ativo').checked,
    destaque: $('#form-destaque').checked,
  };
}

export function limparFormularioProduto() {
  $('#form-id').value = '';
  ['form-nome', 'form-preco', 'form-estoque', 'form-desc', 'form-img'].forEach((id) => { $(`#${id}`).value = ''; });
  $('#form-ativo').checked = true;
  $('#form-destaque').checked = false;
  $('#btn-cancelar-produto').hidden = true;
  $('#btn-salvar-produto').textContent = 'Salvar produto';
}

async function salvarProduto() {
  const id = $('#form-id').value;
  const dados = lerFormularioProduto();

  if (!dados.nome || !dados.preco) return toast('Preencha nome e preço.', 'aviso');

  try {
    if (id) await api.admin.editarProduto(id, dados);
    else await api.admin.criarProduto(dados);
    toast('Produto salvo!');
    limparFormularioProduto();
    await Promise.all([carregarProdutos(), carregarResumo()]);
  } catch (erro) {
    toast(erro.message, 'erro');
  }
}

function editarProduto(id) {
  const p = painel.produtos.find((x) => x.id === id);
  if (!p) return;
  $('#form-id').value = p.id;
  $('#form-nome').value = p.nome;
  $('#form-cat').value = p.cat;
  $('#form-preco').value = p.preco;
  $('#form-estoque').value = p.estoque;
  $('#form-desc').value = p.desc_curta || '';
  $('#form-img').value = p.img || '';
  $('#form-ativo').checked = p.ativo;
  $('#form-destaque').checked = p.destaque;
  $('#btn-cancelar-produto').hidden = false;
  $('#btn-salvar-produto').textContent = 'Salvar alterações';
  $('#form-nome').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirProduto(id) {
  const p = painel.produtos.find((x) => x.id === id);
  if (!confirm(`Excluir "${p?.nome}"? Essa ação não tem volta.`)) return;
  try {
    await api.admin.excluirProduto(id);
    toast('Produto excluído.');
    await Promise.all([carregarProdutos(), carregarResumo()]);
  } catch (erro) {
    toast(erro.message, 'erro');
  }
}

/* ---------------------- Cupons ---------------------- */
async function carregarCupons() {
  try {
    painel.cupons = await api.admin.cupons();
    renderCupons();
  } catch (erro) {
    $('#admin-coupons-list').innerHTML = `<tr><td colspan="6" style="color:var(--danger); padding:16px;">${esc(erro.message)}</td></tr>`;
  }
}

function renderCupons() {
  const corpo = $('#admin-coupons-list');
  if (!painel.cupons.length) {
    corpo.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--muted); padding:20px;">Nenhum cupom cadastrado.</td></tr>`;
    return;
  }
  corpo.innerHTML = painel.cupons.map((c) => `
    <tr>
      <td><b>${esc(c.code)}</b>${c.validade ? `<br><small style="color:var(--muted)">até ${new Date(c.validade).toLocaleDateString('pt-BR')}</small>` : ''}</td>
      <td>${c.discount}%</td>
      <td>${Number(c.min_subtotal) > 0 ? brl(c.min_subtotal) : '—'}</td>
      <td>${c.usos}${c.max_usos ? ` / ${c.max_usos}` : ''}</td>
      <td>${c.ativo ? '<span class="pill" style="color:var(--mint-deep);background:var(--mint-soft)">Ativo</span>' : '<span class="pill" style="color:var(--muted);background:var(--line)">Inativo</span>'}</td>
      <td style="white-space:nowrap;">
        <button class="action-icon edit" data-editar-cupom="${c.id}" aria-label="Editar"><i class="fa-solid fa-pen"></i></button>
        <button class="action-icon delete" data-excluir-cupom="${c.id}" aria-label="Excluir"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`).join('');
}

async function salvarCupom() {
  const id = $('#coupon-id').value;
  const dados = {
    code: $('#coupon-code').value.trim(),
    discount: Number($('#coupon-discount').value),
    min_subtotal: Number($('#coupon-min').value) || 0,
    validade: $('#coupon-validade').value || null,
    max_usos: Number($('#coupon-max').value) || null,
    ativo: true,
  };
  if (!dados.code || !dados.discount) return toast('Preencha código e desconto.', 'aviso');

  try {
    if (id) await api.admin.editarCupom(id, dados);
    else await api.admin.criarCupom(dados);
    toast('Cupom salvo!');
    ['coupon-id', 'coupon-code', 'coupon-discount', 'coupon-min', 'coupon-validade', 'coupon-max'].forEach((k) => { $(`#${k}`).value = ''; });
    await carregarCupons();
  } catch (erro) {
    toast(erro.message, 'erro');
  }
}

function editarCupom(id) {
  const c = painel.cupons.find((x) => x.id === id);
  if (!c) return;
  $('#coupon-id').value = c.id;
  $('#coupon-code').value = c.code;
  $('#coupon-discount').value = c.discount;
  $('#coupon-min').value = Number(c.min_subtotal) || '';
  $('#coupon-validade').value = c.validade ? String(c.validade).slice(0, 10) : '';
  $('#coupon-max').value = c.max_usos || '';
  $('#coupon-code').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function excluirCupom(id) {
  if (!confirm('Excluir este cupom?')) return;
  try {
    await api.admin.excluirCupom(id);
    toast('Cupom excluído.');
    await carregarCupons();
  } catch (erro) {
    toast(erro.message, 'erro');
  }
}

/* ---------------------- Minha conta ---------------------- */
async function salvarConta() {
  const novo_login = $('#conta-login').value.trim();
  const nova_senha = $('#conta-senha-nova').value;
  const senha_atual = $('#conta-senha-atual').value;
  const msg = $('#conta-msg');

  if (!senha_atual) return toast('Informe a senha atual para confirmar.', 'aviso');
  if (!novo_login && !nova_senha) return toast('Preencha o novo login ou a nova senha.', 'aviso');

  try {
    const r = await api.admin.atualizarConta({ novo_login: novo_login || undefined, nova_senha: nova_senha || undefined, senha_atual });
    $('#conta-login').value = '';
    $('#conta-senha-nova').value = '';
    $('#conta-senha-atual').value = '';
    msg.className = 'hint';

    if (r.relogar) {
      toast('Login atualizado! Entre novamente.');
      alternarNavAdmin(false);
      location.hash = '#/entrar';
    } else {
      toast('Dados da conta atualizados!');
    }
  } catch (erro) {
    msg.className = 'hint err';
    msg.textContent = erro.message;
    toast(erro.message, 'erro');
  }
}

/* ==================================================================
   EVENTOS (registrados uma única vez)
================================================================== */
export function configurarAdmin() {
  $('#btn-sair').addEventListener('click', sair);
  $('#btn-salvar-produto').addEventListener('click', salvarProduto);
  $('#btn-cancelar-produto').addEventListener('click', limparFormularioProduto);
  $('#btn-salvar-cupom').addEventListener('click', salvarCupom);
  $('#btn-salvar-conta').addEventListener('click', salvarConta);

  $('#filtros-pedidos').addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-status]');
    if (!botao) return;
    document.querySelectorAll('#filtros-pedidos .filtro-btn').forEach((b) => b.classList.remove('active'));
    botao.classList.add('active');
    painel.filtroStatus = botao.dataset.status;
    carregarPedidos();
  });

  $('#page-admin').addEventListener('click', (evento) => {
    const alvo = (attr) => evento.target.closest(`[${attr}]`)?.getAttribute(attr);

    const editarP = alvo('data-editar-produto');
    if (editarP) return editarProduto(Number(editarP));

    const excluirP = alvo('data-excluir-produto');
    if (excluirP) return excluirProduto(Number(excluirP));

    const editarC = alvo('data-editar-cupom');
    if (editarC) return editarCupom(Number(editarC));

    const excluirC = alvo('data-excluir-cupom');
    if (excluirC) return excluirCupom(Number(excluirC));

    const enviar = alvo('data-enviar');
    if (enviar) {
      const pedido = painel.pedidos.find((p) => p.id === Number(enviar));
      mudarStatusPedido(Number(enviar), 'enviado').then(() => {
        if (pedido && confirm(`Avisar ${pedido.cliente_nome} pelo WhatsApp?`)) {
          abrirWhatsApp(pedido, `Olá ${pedido.cliente_nome}! Seu pedido ${pedido.codigo} da DulceRecordatio já foi postado nos Correios e está a caminho 💌`);
        }
      });
      return;
    }

    const entregue = alvo('data-entregue');
    if (entregue) return mudarStatusPedido(Number(entregue), 'entregue');

    const whats = alvo('data-whats');
    if (whats) {
      const pedido = painel.pedidos.find((p) => p.id === Number(whats));
      if (pedido) abrirWhatsApp(pedido, `Olá ${pedido.cliente_nome}! Aqui é da DulceRecordatio, sobre o seu pedido ${pedido.codigo} 💌`);
    }
  });
}
