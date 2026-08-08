# DulceRecordatio — loja online

Papelaria afetiva & escolar. Loja completa com catálogo, carrinho, frete por CEP,
cupons, checkout do Mercado Pago e painel administrativo.

---

## Como isso funciona (em uma imagem mental)

```
Navegador  ──►  Servidor Node (este projeto)  ──►  Banco Neon
   │                     │
   │                     └──►  Mercado Pago (cria o pagamento)
   └── nunca vê senha, token nem string de conexão
```

O navegador **nunca** conversa direto com o banco. Isso não é frescura: a senha do
Postgres não tem como ficar escondida dentro de um arquivo HTML — qualquer visitante
lê o código-fonte da página com Ctrl+U.

---

## Primeira instalação (5 passos)

### 1. Gere uma senha nova no Neon

A senha antiga estava escrita dentro do HTML antigo, ou seja: está pública.

No painel do Neon → **Roles** → `neondb_owner` → **Reset password**.
Copie a nova connection string.

### 2. Crie o arquivo `.env`

Copie o modelo:

```bash
copy .env.example .env
```

Abra o `.env` e preencha:

- `DATABASE_URL` — a connection string nova do Neon
- `JWT_SECRET` — gere uma chave aleatória:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

- `ADMIN_EMAIL` e `ADMIN_SENHA` — o login do painel administrativo

### 3. Instale as dependências

```bash
npm install
```

### 4. Prepare o banco

```bash
npm run setup:db
```

Isso cria as tabelas, cadastra o administrador e — só se a loja estiver vazia —
insere três produtos de exemplo. Pode rodar de novo sempre que quiser: nada é apagado.

### 5. Suba a loja

```bash
npm run dev
```

Abra http://localhost:3000 · painel em http://localhost:3000/#/admin

---

## Mercado Pago

Sem `MP_ACCESS_TOKEN` no `.env`, a loja funciona normalmente e manda o cliente
para o link de pagamento estático (`MP_LINK_FALLBACK`) — o pedido fica salvo no
banco do mesmo jeito.

Para o checkout automático:

1. Painel do Mercado Pago → **Suas integrações** → **Credenciais de produção**
2. Copie o *Access Token* para `MP_ACCESS_TOKEN` no `.env`
3. Coloque a URL pública do site em `SITE_URL`

**O webhook não funciona em `localhost`.** É por ele que o pedido vira "pago"
sozinho e o estoque baixa. Em produção o endereço é:

```
https://seudominio.com.br/api/pagamentos/webhook
```

Enquanto o site estiver só na sua máquina, marque os pedidos manualmente no painel.

---

## Comandos

| Comando | O que faz |
|---|---|
| `npm run dev` | Sobe o site e reinicia sozinho quando você edita um arquivo |
| `npm start` | Sobe o site em modo produção |
| `npm run setup:db` | Cria/atualiza as tabelas e o administrador |
| `npm run criar:admin -- email@exemplo.com "senha-forte"` | Cria outro admin ou troca uma senha |

---

## Estrutura

```
db/schema.sql        estrutura das tabelas
db/seed.sql          produtos de exemplo
scripts/             instalação do banco e criação de admin
server/
  config.js          leitura do .env (único lugar que lê variáveis de ambiente)
  db.js              conexão com o Neon
  auth.js            login do admin (bcrypt + JWT em cookie httpOnly)
  pricing.js         preço, estoque, frete e cupom — a fonte da verdade
  mercadopago.js     criação do pagamento
  routes/            loja, pedidos, autenticação, admin
public/
  index.html         a loja inteira (uma página, várias telas)
  css/style.css
  js/                api, interface, loja, admin
```

---

## Decisões que valem conhecer

**Todo cálculo de dinheiro acontece no servidor.** O navegador manda só
`{ id, quantidade }`, CEP e código do cupom. Preço, estoque, frete e desconto são
lidos do banco a cada requisição. Sem isso, qualquer pessoa comprava uma agenda
por R$ 0,01 mexendo no DevTools.

**Só o Mercado Pago marca um pedido como pago.** O pedido nasce
`aguardando_pagamento` e muda de status pelo webhook, depois que o servidor
consulta o pagamento na API. A tela de "obrigado" é informativa, não decide nada.

**A senha do admin é guardada como hash bcrypt.** O login devolve um cookie
`httpOnly`, que o JavaScript da página não consegue ler.

**O estoque baixa uma vez só**, quando o pagamento é aprovado, protegido pela
coluna `estoque_baixado` — se o Mercado Pago reenviar o mesmo aviso, nada é
descontado duas vezes.

---

## Publicar na internet

Qualquer hospedagem que rode Node serve (Render, Railway, Fly.io, uma VPS).
O que muda em relação à sua máquina:

1. Cadastre as mesmas variáveis do `.env` no painel da hospedagem
2. `SITE_URL` = o domínio real, com `https://`
3. `NODE_ENV=production`
4. Comando de start: `npm start`
5. Cadastre a URL do webhook no painel do Mercado Pago

---

## Ainda dá pra melhorar

- Upload de imagens (hoje o produto usa URL de imagem)
- Frete calculado direto na API dos Correios (hoje é uma tabela por estado, em `server/pricing.js`)
- E-mail automático de confirmação para o cliente
- Página própria por produto, com URL própria (ajuda no Google)
