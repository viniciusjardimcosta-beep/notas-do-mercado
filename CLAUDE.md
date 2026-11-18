# Caderninho do Mercado: regras do projeto

PWA que lê notas de mercado (QR Code da NFC-e) e mostra gasto por categoria, aumento de preços, inflação pessoal e onde cortar. Endereço público: https://caderninhodomercado.com.br (página de apresentação em /conheca/). Em fase de piloto com poucos testadores.

Leia estas regras antes de mexer em qualquer arquivo.

## Princípios (não negociáveis)

1. **O mais básico possível.** Antes de acrescentar algo, pergunte se dá para resolver sem. Nada de framework, build, banco de dados ou conta de usuário.
2. **Os dados ficam só no celular de cada pessoa** (localStorage, chave `notas.v1`). Nenhum dado de nota, loja, produto, valor ou CPF vai para servidor. O backup é um arquivo que a própria pessoa baixa.
3. **O Worker (`worker.js`) só repassa** a página pública da nota e conta consultas por estado de forma anônima (UF e ok/erro). Ele nunca grava chave de acesso, endereço, IP ou conteúdo da nota.
4. **Sem terceiros** no app e na página de apresentação: nada de scripts, fontes, imagens, pixels, analytics ou cookies de terceiros. Fontes e imagens ficam no próprio repositório.
5. **Honestidade sobre o que foi testado.** Hoje só o Rio Grande do Sul está validado na leitura de notas. Não escreva em lugar nenhum que outros estados funcionam sem teste real.
6. **Privacidade do autor.** Não escreva nome pessoal, e-mail, telefone, endereço, número de processo ou dados de terceiros em código, comentários, textos, commits ou arquivos do repositório. Commits saem com o autor genérico já configurado.
7. **Linguagem do usuário:** português do Brasil, frases curtas, sem jargão ("CSC", "SEFAZ" só quando for indispensável, e explicado). Erros dizem o que aconteceu e o que fazer, sem culpar a pessoa nem o mercado.

## Estrutura

Arquivos na raiz do repositório (é o que o GitHub Pages publica):

- `index.html`, `app.js`, `core.js`, `parser.js`, `sw.js`, `manifest.webmanifest`, `privacidade.html`, `icon.svg`, `jsQR.js`: o app.
- `core.js`: regras de cálculo (categorias, preços, inflação, lista de compras). `parser.js`: leitura do texto/HTML da nota. `app.js`: telas.
- `conheca/`: página de apresentação, HTML e CSS puros, sem JavaScript.
- `worker.js`: proxy do Cloudflare. **Mudanças nele só valem depois que a pessoa responsável cola o código no painel do Cloudflare e faz o deploy.** Avise isso sempre.
- `ler-metricas.js`: lê o contador anônimo por estado (precisa de token do Cloudflare, nunca colocar o token no repositório).
- `tests/` e `rodar-testes.sh`.

## Testes

Rode `./rodar-testes.sh` na raiz. Requer Node e `playwright` com Chromium. O script monta uma cópia temporária no formato que os testes esperam (pastas `app/`, `site/`, `worker/`) e roda os quatro conjuntos: unitários, Worker, página de apresentação e navegador.

- **Nada vai para o ar com teste falhando.**
- Toda mudança de comportamento ganha teste. Bug corrigido ganha teste que o reproduz.
- O teste do navegador não pode ter erro de console.

## Como publicar

1. Mostre a mudança à pessoa responsável (o que mudou, como fica na tela, como testar no celular) e **espere o "pode publicar"**. Não publique por conta própria.
2. Aumente `VERSION` em `app.js` e troque o nome do cache em `sw.js` (`notas-vNN`), senão o celular continua com a versão antiga.
3. Atualize o `README.md` com uma seção curta sobre a mudança.
4. Commit em português, no imperativo e curto, com a versão no título (ex.: `v0.20.1: preço do kg e total do item no cadastro à mão`). Depois `git pull --rebase` e `git push`.
5. Diga à pessoa quanto o GitHub Pages leva (1 a 2 minutos), que o celular pode precisar de duas aberturas do app, e como conferir.

## Regras de código

- JavaScript simples, sem dependências. `app.js` monta a tela com a função `h()`; não use `innerHTML` com texto vindo da nota ou do usuário.
- Valores iniciais (`defaults`) são copiados em profundidade; nunca compartilhe arrays ou objetos entre estados.
- O modo exemplo (`DEMO`) nunca grava no `localStorage` real.
- Dinheiro em reais com 2 casas; quantidade pode ter até 4 casas (peso). `Core.parseMoney` serve para dinheiro, não para quantidade.
- Notas registradas à mão só com o total têm `semItens: true` e `items: []`: entram no gasto do mês e em "Outros", mas não viram produto.
- Mensagens de erro de leitura ficam em `handleInput` / `handleText`. Erros passageiros (238, 5xx, tempo esgotado) guardam a nota em `pendentes`; erros definitivos (101, CAPTCHA, 403/404) oferecem o plano B ou o cadastro à mão.

## Página de apresentação (`conheca/`)

- HTML e CSS apenas; fontes `.woff2` do próprio repositório.
- Texto sem promessa que o app não cumpre. O aviso sobre o Rio Grande do Sul fica perto de cada botão de chamada.
- Qualquer mudança precisa passar no `tests/site.test.js` (sem terceiros, sem estouro de largura em 360, 390, 768 e 1280 px, imagens e fontes carregando).

## Decisões adiadas (não implementar sem pedido)

App nativo, venda do app, cobrança recorrente, aba de delivery e gasto avulso, comparação de mercados na lista, medição de cliques da página. Dependem do retorno do questionário dos testadores.
