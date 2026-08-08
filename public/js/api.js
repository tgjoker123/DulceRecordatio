/**
 * Camada única de conversa com o servidor.
 * Nenhuma senha, token ou string de conexão passa por aqui — o navegador
 * só fala com a nossa própria API, e ela que conversa com o banco.
 */

export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

async function pedir(caminho, { metodo = 'GET', corpo } = {}) {
  let resposta;
  try {
    resposta = await fetch(caminho, {
      method: metodo,
      headers: corpo ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ErroApi('Sem conexão com o servidor. Verifique sua internet.', 0);
  }

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroApi(dados.erro || 'Algo deu errado.', resposta.status);
  return dados;
}

export const api = {
  config:            ()          => pedir('/api/config'),
  produtos:          ()          => pedir('/api/produtos'),
  frete:             (corpo)     => pedir('/api/frete', { metodo: 'POST', corpo }),
  validarCupom:      (corpo)     => pedir('/api/cupom/validar', { metodo: 'POST', corpo }),
  resumoCarrinho:    (corpo)     => pedir('/api/carrinho/resumo', { metodo: 'POST', corpo }),
  criarPedido:       (corpo)     => pedir('/api/pedidos', { metodo: 'POST', corpo }),
  statusPedido:      (codigo)    => pedir(`/api/pedidos/${encodeURIComponent(codigo)}/status`),

  login:  (corpo) => pedir('/api/auth/login', { metodo: 'POST', corpo }),
  logout: ()      => pedir('/api/auth/logout', { metodo: 'POST', corpo: {} }),
  me:     ()      => pedir('/api/auth/me'),

  admin: {
    resumo:          ()            => pedir('/api/admin/resumo'),
    produtos:        ()            => pedir('/api/admin/produtos'),
    criarProduto:    (corpo)       => pedir('/api/admin/produtos', { metodo: 'POST', corpo }),
    editarProduto:   (id, corpo)   => pedir(`/api/admin/produtos/${id}`, { metodo: 'PUT', corpo }),
    excluirProduto:  (id)          => pedir(`/api/admin/produtos/${id}`, { metodo: 'DELETE' }),

    cupons:          ()            => pedir('/api/admin/cupons'),
    criarCupom:      (corpo)       => pedir('/api/admin/cupons', { metodo: 'POST', corpo }),
    editarCupom:     (id, corpo)   => pedir(`/api/admin/cupons/${id}`, { metodo: 'PUT', corpo }),
    excluirCupom:    (id)          => pedir(`/api/admin/cupons/${id}`, { metodo: 'DELETE' }),

    pedidos:         (status = '') => pedir(`/api/admin/pedidos${status ? `?status=${status}` : ''}`),
    mudarStatus:     (id, status)  => pedir(`/api/admin/pedidos/${id}/status`, { metodo: 'PATCH', corpo: { status } }),
  },
};
