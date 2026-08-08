/** Helpers de interface usados pela loja e pelo painel. */

export const $ = (seletor) => document.querySelector(seletor);

export const CATEGORIAS = {
  encadernacao: 'Agendas & Cadernetas',
  decoracao: 'Quadros & Fotografias',
};

export const STATUS_PEDIDO = {
  aguardando_pagamento: { texto: 'Aguardando pagamento', cor: 'var(--amber)',     fundo: '#fef3c7' },
  pago:                 { texto: 'Pago',                 cor: 'var(--mint-deep)', fundo: 'var(--mint-soft)' },
  enviado:              { texto: 'Enviado',              cor: 'var(--blue)',      fundo: '#e0f2fe' },
  entregue:             { texto: 'Entregue',             cor: 'var(--ink)',       fundo: 'var(--line)' },
  cancelado:            { texto: 'Cancelado',            cor: 'var(--danger)',    fundo: '#fee2e2' },
  estornado:            { texto: 'Estornado',            cor: 'var(--danger)',    fundo: '#fee2e2' },
};

const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = (valor) => formatador.format(Number(valor) || 0);

/**
 * Escapa texto antes de jogar no HTML.
 * Sem isso, o nome de um produto com < ou " quebraria a página — e um nome
 * malicioso viraria script rodando no navegador do cliente.
 */
export function esc(valor) {
  return String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

let timerToast;
export function toast(mensagem, tipo = 'ok') {
  const el = $('#toast');
  const icone = $('#toast-icon');
  $('#toast-text').textContent = mensagem;

  const estilos = {
    ok:    { cor: 'var(--mint)',   icone: 'fa-circle-check' },
    erro:  { cor: 'var(--danger)', icone: 'fa-circle-exclamation' },
    aviso: { cor: 'var(--amber)',  icone: 'fa-circle-info' },
  }[tipo] || {};

  el.style.borderLeftColor = estilos.cor;
  icone.style.color = estilos.cor;
  icone.className = `fa-solid ${estilos.icone}`;

  el.classList.add('show');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => el.classList.remove('show'), 3200);
}

export function mostrarPagina(id) {
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active-page'));
  document.getElementById(id)?.classList.add('active-page');
  window.scrollTo(0, 0);
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function pill(status) {
  const s = STATUS_PEDIDO[status] || { texto: status, cor: 'var(--muted)', fundo: 'var(--line)' };
  return `<span class="pill" style="color:${s.cor}; background:${s.fundo};">${esc(s.texto)}</span>`;
}
