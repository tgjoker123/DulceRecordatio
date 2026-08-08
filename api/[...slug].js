/**
 * Entrada da API na Vercel.
 *
 * O nome do arquivo entre colchetes é a forma da Vercel dizer "pegue
 * qualquer caminho abaixo de /api": /api/produtos, /api/auth/login,
 * /api/admin/pedidos, todos caem aqui e o Express decide o que fazer.
 *
 * Não tem app.listen(): na Vercel não existe servidor ligado esperando.
 * A função sobe quando chega uma requisição e some depois.
 */
import { criarApp } from '../server/app.js';

// Os arquivos da loja (public/) são entregues pela CDN da Vercel,
// então aqui o Express cuida só da API.
export default criarApp({ servirArquivos: false });
