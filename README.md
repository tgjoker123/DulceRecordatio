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
vercel.json          configuração do deploy na Vercel
api/[...slug].js     entrada da API na Vercel (sem servidor ligado)
db/schema.sql        estrutura das tabelas
db/seed.sql          produtos de exemplo
scripts/             instalação do banco e criação de admin
server/
  app.js             monta o Express (usado pela Vercel e pela sua máquina)
  index.js           entrada local: liga o servidor numa porta
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

## Quando algo dá errado

| Mensagem | O que houve |
|---|---|
| `password authentication failed` | Senha errada na `DATABASE_URL` — copie de novo no Neon com *Show password* ligado |
| `getaddrinfo ENOTFOUND` | Faltou pedaço do endereço ao colar a connection string |
| `Configuração incompleta` | Alguma linha obrigatória do `.env` ficou vazia |
| `column "..." does not exist` | Banco de uma versão anterior — rode `npm run setup:db`, que migra sem apagar nada |
| `A porta ... já está sendo usada` | Outro programa ocupa a porta; troque `PORT` no `.env` |

### Mudei a senha no `.env` e o login não aceita

Isso é esperado. O `.env` **não** é consultado na hora do login: quem lê ele é o
`npm run setup:db`, que grava o administrador no banco. Editar o arquivo não
muda a senha que já está gravada no Neon.

Depois de mexer em `ADMIN_EMAIL` ou `ADMIN_SENHA`, rode de novo:

```bash
npm run setup:db
```

Confira também o endereço: se o `.env` diz `PORT=3001`, a loja está em
`http://localhost:3001`. Em `3000` pode estar respondendo outro projeto seu.

## Publicar na Vercel

O projeto já vem configurado. Na Vercel não existe um servidor ligado o tempo
todo: os arquivos de `public/` são entregues pela CDN, e cada chamada a `/api`
vira uma função temporária. É por isso que existem dois pontos de entrada —
`server/index.js` para a sua máquina e `api/[...slug].js` para a Vercel.

### Passo a passo

1. **vercel.com** → *Add New* → *Project* → importe o repositório `DulceRecordatio`
2. Não mexa em Build Command nem Output Directory — o `vercel.json` já resolve
3. Cadastre as variáveis em **Settings → Environments → clique em `Production`**.

   Atenção: a página *Environments* só lista os ambientes. As variáveis ficam
   **dentro** de cada um — é preciso entrar no `Production` para achar a seção
   *Environment Variables*.

| Variável | Valor |
|---|---|
| `DATABASE_URL` | a connection string do Neon |
| `JWT_SECRET` | a mesma chave longa do seu `.env` |
| `MP_ACCESS_TOKEN` | o token do Mercado Pago (pode deixar pra depois) |
| `MP_LINK_FALLBACK` | seu link estático do Mercado Pago |
| `SITE_URL` | *deixe em branco por enquanto* |
| `FRETE_GRATIS_ACIMA` | `250` |

`NODE_ENV=production` a Vercel já define sozinha. `PORT` não é usada lá.

4. **Deploy**. No fim ela te dá um endereço, tipo `dulce-recordatio.vercel.app`
5. Volte em *Settings → Environment Variables* e preencha o `SITE_URL` com esse
   endereço, **com `https://` e sem barra no final**. Depois *Deployments →
   Redeploy*, senão o Mercado Pago não consegue devolver o cliente pra loja.

### Detalhes que importam

**O banco continua sendo o Neon.** A Vercel só roda o código. Não precisa
migrar nada, e o `npm run setup:db` você continua rodando da sua máquina.

**Deixe a função na região de São Paulo.** Em *Settings → Functions*, escolha
`gru1`. O padrão é nos Estados Unidos, e cada consulta ao Neon (que está em
`sa-east-1`) faria a viagem de ida e volta à toa.

**O webhook passa a funcionar.** Cadastre no painel do Mercado Pago:
`https://seu-endereco.vercel.app/api/pagamentos/webhook` — é ele que marca o
pedido como pago e baixa o estoque sozinho.

**Limite de tentativas de login.** Ele é guardado na memória da função. Como
cada função é temporária, a proteção contra força bruta fica mais fraca na
Vercel do que num servidor comum. Para uma loja desse porte, tudo bem.

## Publicar em outro lugar

Qualquer hospedagem que rode Node também serve (Render, Railway, Fly.io, VPS).
Nesse caso `api/` e `vercel.json` são ignorados, e o que vale é:

1. As mesmas variáveis do `.env` no painel da hospedagem
2. `SITE_URL` = o domínio real, com `https://`
3. `NODE_ENV=production`
4. Comando de start: `npm start`
5. A URL do webhook cadastrada no Mercado Pago

---

## Ainda dá pra melhorar

- Upload de imagens (hoje o produto usa URL de imagem)
- Frete calculado direto na API dos Correios (hoje é uma tabela por estado, em `server/pricing.js`)
- E-mail automático de confirmação para o cliente
- Página própria por produto, com URL própria (ajuda no Google)
