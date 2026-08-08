/** Helpers pequenos usados pelas rotas. */

/** Envolve um handler async pra que erro vire resposta 500 em vez de derrubar o processo. */
export function rota(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/** Erro de validação/regra de negócio: vira 400 com mensagem legível pro cliente. */
export function erro400(mensagem) {
  return new ErroHttp(400, mensagem);
}

/** Texto obrigatório, com limite de tamanho. */
export function texto(valor, campo, { min = 1, max = 500 } = {}) {
  const v = String(valor ?? '').trim();
  if (v.length < min) throw erro400(`Campo "${campo}" é obrigatório.`);
  if (v.length > max) throw erro400(`Campo "${campo}" é longo demais (máx. ${max}).`);
  return v;
}

/** Texto opcional já limpo. */
export function textoOpcional(valor, max = 500) {
  return String(valor ?? '').trim().slice(0, max);
}

export function numero(valor, campo, { min = 0, max = 1e9 } = {}) {
  const n = Number(valor);
  if (!Number.isFinite(n)) throw erro400(`Campo "${campo}" precisa ser um número.`);
  if (n < min || n > max) throw erro400(`Campo "${campo}" fora do intervalo permitido.`);
  return n;
}

export function inteiro(valor, campo, opcoes) {
  return Math.trunc(numero(valor, campo, opcoes));
}

/** Arredonda pra 2 casas sem os erros clássicos de ponto flutuante. */
export function dinheiro(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Só dígitos — usado em CEP e telefone. */
export function digitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Código amigável do pedido: DR-K3M9QX */
export function gerarCodigoPedido() {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem 0/O/1/I pra não confundir
  let saida = '';
  for (let i = 0; i < 6; i++) saida += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return `DR-${saida}`;
}
