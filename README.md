# Caderninho do Mercado (MVP)

App web instalável que lê a nota fiscal do mercado (NFC-e), guarda os itens **só no seu celular** e mostra:

- gasto por mês e por categoria;
- o que subiu de preço (por kg, litro ou unidade);
- sua "inflação do mercado" (média ponderada dos produtos que você repetiu);
- quanto você economizaria cortando X% das categorias que **você** marcou como cortáveis;
- onde um produto saiu mais barato, quando você comprou em mais de uma loja.

Sem login, sem servidor de dados, sem anúncios. O único componente externo é um proxy de leitura (veja abaixo).

## O que foi testado e o que NÃO foi

Testado aqui (`node tests/unit.test.js`, `node tests/worker.test.js` com rede simulada e `node tests/browser.test.js`): chave de acesso e dígito verificador, leitura de texto de nota, normalização de nomes, cálculos, fluxo da interface no Chromium, persistência e proteção contra HTML injetado.

**Não testado:** páginas reais da SEFAZ de RS, SC, PR e SP. Não consegui acessá-las daqui, e os HTMLs dos testes são sintéticos, feitos de memória do layout comum. **É por isso que existe a semana 0 abaixo.** O leitor tem 3 estratégias e avisa quando a soma dos itens não bate com o total, mas só nota real diz se funciona.

Também não testado: a câmera (precisa de celular) e o proxy no ar.

## Semana 0: testar com notas reais (faça antes de qualquer outra coisa)

1. Publique o app e o proxy (passos abaixo).
2. Com 20 notas de verdade (5 de cada estado, de mercados diferentes), use **Adicionar → Escanear**.
3. Anote para cada nota: leu todos os itens? o total bateu? o nome dos itens veio legível?
4. Se alguma falhar, abra a nota no navegador, copie o texto e use o plano B (opção 3). Se o plano B também falhar, me mande o texto da nota **sem o CPF** que eu ajusto o leitor.

Meta do plano: 90% das notas lidas completas. Abaixo de 70%, o risco técnico é grande demais.

## Como rodar no computador

```bash
cd app
python3 -m http.server 8080
# abra http://localhost:8080
```

A câmera só funciona em `https` ou `localhost`.

## Como publicar de graça

**1. O app (pasta `app/`)**: qualquer hospedagem de arquivos estáticos com https. Opções: Cloudflare Pages, GitHub Pages ou Netlify. Arraste a pasta `app/` ou aponte o repositório. No celular, abra o endereço e use "Adicionar à tela inicial".

**2. O proxy (pasta `worker/`)**: o navegador não consegue ler as páginas da SEFAZ direto (bloqueio CORS), então um proxy minúsculo busca a página pública e devolve o texto.

**Pelo painel da Cloudflare (sem instalar nada):**

1. Crie uma conta em dash.cloudflare.com (e-mail e senha; confirme o e-mail).
2. No menu da esquerda: **Workers & Pages → Create → Create Worker**. Deixe o exemplo "Hello World", dê o nome `notas-proxy` e clique **Deploy**.
3. Clique em **Edit code**, apague tudo, cole o conteúdo inteiro de `worker/worker.js` e clique **Deploy**.
4. Copie o endereço do Worker (algo como `https://notas-proxy.SEUNOME.workers.dev`) e cole em **Ajustes → Proxy de leitura** no app.

(Os nomes dos botões podem mudar; a Cloudflare altera o painel de tempos em tempos.) Pelo terminal também funciona: `cd worker && npx wrangler login && npx wrangler deploy`.

**Custo:** segundo a documentação da Cloudflare, o plano grátis do Workers inclui 100.000 requisições por dia e 10 ms de CPU por chamada, bem acima do uso pessoal. A página não diz se o cadastro pede cartão de crédito. Confira na hora do cadastro.

**Limite de consultas (v0.10.3):** o Worker barra um mesmo endereço de rede depois de 60 consultas por minuto (resposta 429, e o app mostra "Espere um minuto"). Uma pessoa usa 1 consulta por nota, então o limite só pega scripts. A contagem fica na memória do Worker, por instância: é um freio aproximado. Para um limite exato, crie um *Rate Limiting binding* chamado `LIMITER` no Worker (Cloudflare: Settings → Bindings); se ele existir, o código usa o binding no lugar da contagem em memória. Acompanhe o uso no painel da Cloudflare (Workers → Metrics); o plano grátis inclui 100.000 pedidos por dia.

**Segurança:** o proxy só responde ao site do app (`ALLOWED_ORIGIN` no topo do `worker.js`; se mudar o endereço do app, mude lá também), só busca endereços `.gov.br` de fazenda/sefaz, não guarda nem registra nada. A lista de permitidos foi conferida em 09/11/2026 contra os endereços de consulta publicados de todas as UFs (a regra aceita qualquer `.gov.br` com fazenda, sefaz, sefin, sef., sefa., nfce, receita, svrs, dfe ou `set.` no nome). Isso corrigiu o Pará (`appnfc.sefa.pa.gov.br`), que seria recusado. O que isso **não** garante: o layout da página de cada estado. Se uma nota for recusada com "Site não permitido", me avise.

## Menos trabalho por nota

- **Salvar automático** (Ajustes, ligado por padrão): se a soma dos itens bate com o total, a chave confere e a nota não é repetida, ela é salva direto, com botão **Desfazer** por 8 segundos. Se algo não bater, aparece a tela de conferência.
- **Com o proxy ligado**, escanear o QR Code basta: o app busca a nota e salva.
- **Compartilhar para o app** (Android, app instalado): no menu Compartilhar de qualquer app ou navegador, o Notas aparece como destino; o endereço chega e o fluxo acima roda sozinho. Não confirmei se funciona no iPhone.
- **Categoria por item** (aba Compras): toque na categoria de um item para corrigir. O app lembra para o produto todo, em todas as notas.

## Piloto (v0.3)

- **Proxy padrão:** o endereço do proxy vem embutido no `app/index.html` (`window.NOTAS_CONFIG`), então quem testa não precisa configurar nada. Se mudar o Worker, mude lá.
- **Boas-vindas:** tela curta na primeira abertura, com aviso de que o app está em teste e link da política de privacidade.
- **Enviar problema (Ajustes):** gera um relatório com o texto da última nota lida, sem CPF, e abre o menu Compartilhar do celular. Não há servidor de feedback: a pessoa manda para quem coordena o teste.
- **Refazer categorias:** apaga as correções manuais e reaplica a lista de palavras atual.
- **`app/privacidade.html`:** rascunho da política, com o contato do projeto (caderninhodomercado@gmail.com) já preenchido. Peça revisão jurídica antes de abrir ao público.

## Funcionalidades extras (v0.5 a v0.8)

- **Gráfico de histórico de preço** por produto (tela Preços): toque no ponto para ver data, preço e loja.
- **Aviso de estado não testado:** só o RS foi testado (`UF_TESTADAS` em `app.js`); em outros estados o erro de leitura mostra o aviso e o plano B. O relatório de problema inclui a UF.
- **Meta mensal** (Resumo): barra de progresso do mês do calendário, com estimativa de fechamento depois do dia 10.
- **Quanto paguei?** (Preços): busca por produto com última compra, menor preço e comparação com o preço da prateleira.
- **Embalagem menor, preço maior:** compara produtos com o mesmo nome e tamanho diferente (3% a 30% menor) em que o preço por kg/litro subiu 3% ou mais. Pode errar quando os dois tamanhos existem juntos; o texto é cauteloso. O preço por kg/litro usa o tamanho do nome de cada compra.
- **Lista de compras** (Compras → Lista de compras): produtos repetidos em 2 ou mais datas, os que "provavelmente estão acabando" (80% do intervalo médio) primeiro, seleção com estimativa e envio pelo menu Compartilhar. `listaSel` e `listaFora` entram no backup.

## Divulgação embutida (v0.10)

- **Compartilhar imagem** (Resumo, abaixo da inflação): gera um cartão PNG de 1080x1350 com a inflação dos últimos 12 meses, o número de notas lidas e quantos produtos encolheram, mais o endereço do app. Não inclui valores gastos, produtos, lojas nem datas. Só aparece quando há inflação calculada ou embalagem menor. Sem suporte a compartilhar arquivo, baixa a imagem.
- **Indicar para um amigo** (Ajustes): abre o menu Compartilhar com uma mensagem pronta e o endereço.

## Câmera no iPhone (v0.10.1 e v0.10.2)

- O Safari do iPhone mostrava a câmera ligada com imagem preta porque `muted` e `playsinline` estavam só como atributo. Agora são definidos como propriedade; se o início automático for recusado, um toque na imagem liga; se nenhuma imagem aparecer em 6 s, o app explica o que fazer.
- O leitor de QR (jsQR 1.4.0, Apache-2.0, `app/jsQR.js`) agora vem junto com o app, em vez de ser baixado do cdnjs. O iPhone não tem `BarcodeDetector`, então depende dele para escanear. Teste de decodificação em `tests/browser.test.js` com imagem em `tests/fixtures/qr.png`.
- **Confirmado em iPhone real (Safari) em 09/11/2026**, por um testador, depois da v0.10.2. Os testes automáticos usam a câmera simulada do Chromium. Android também confirmado em 09/11/2026.

## Página de apresentação (`site/`, publicada em `/conheca/`)

- Página estática, sem JavaScript e sem terceiros (as fontes são servidas do próprio site, subconjunto de Bricolage Grotesque e Courier Prime, licença OFL em `site/fonts/`). Use `https://caderninhodomercado.com.br/conheca/` em vídeos, bio e grupos.
- O app continua na raiz (`/`): as notas ficam presas ao endereço, então o app **não pode mudar de lugar** sem os usuários perderem os dados.
- As capturas de tela (`site/img/`) e o cupom do topo usam **dados fictícios**, e a página diz isso. Se mudar o visual do app, refaça as capturas.
- `site/previa.png` (1200x630) é a imagem que aparece quando o link é colado no WhatsApp.
- Testes: `node tests/site.test.js` (sem links externos, arquivos existem, sem estouro lateral em 360 a 1280 px, imagens e fontes carregam).
- Afirmações da página que precisam continuar verdadeiras: "grátis" (hoje), "RS validado, outros estados em teste", "não guarda CPF", "sem cadastro". Se algo mudar (plano Pro, novos estados), atualize a página junto.

## Modo exemplo (v0.11)

- **O que é:** o app abre com 9 notas fictícias (uma a cada 4 semanas, a última de hoje) para a pessoa ver o resultado antes de escanear. Entradas: botão "Ver com dados de exemplo" nas boas-vindas e na tela vazia, "Ver exemplo" em Ajustes e o link `/?exemplo` (usado pela página de apresentação).
- **Isolamento:** `S` passa a ser o conjunto fictício só na memória, `save()` não grava nada e as notas reais ficam guardadas em `REAL` até sair. Recarregar a página também sai do exemplo. Testado: dados reais idênticos byte a byte depois de usar o exemplo, e nada gravado em aparelho vazio.
- **Desligado dentro do exemplo:** compartilhar imagem (para ninguém divulgar a inflação fictícia como sua), backup e aviso de backup, importar, apagar tudo, ajustes e adicionar nota (sai do exemplo e vai para Adicionar).
- Faixa amarela fixa no topo com "Usar minhas notas" e "Sair do exemplo".
- O service worker agora casa o cache ignorando `?...` quando está sem internet.

## Pendências de marca (checar antes de divulgar ou registrar)

- Busca no INPI em 07/11/2026 pelo radical "caderninho": 17 processos, nenhum igual a "Caderninho do Mercado". Os arquivados, extintos e indeferidos não impedem o uso.
- **Acompanhar:** processo **943832039**, marca "Caderninho" (Diogo Martins Barros), **classe 42** (software), depositado em 21/05/2026, "aguardando exame de mérito". Se for registrado, pode colidir com o nosso nome. Conferir o andamento no INPI de tempos em tempos.
- Em vigor em outros ramos (risco baixo): "Caderninho de Cultura" (classes 25, 28, 35, 41) e "Caderninho Amarelo" (classes 35, 41).
- Antes de registrar a marca ou gastar com divulgação: consulta a um agente de propriedade industrial.

## Limitações conhecidas

- **CAPTCHA:** alguns estados pedem. O app detecta e manda você para o plano B (colar o texto).
- **Nomes de produto** vêm abreviados (`BISC REC OREO 90G`). O app junta variações pelo código de barras (quando o código parece um GTIN) ou por nome parecido e mesmo tamanho. Erros acontecem: confira a tela **Preços**. Falta uma tela para editar/unir produtos manualmente.
- **Categorias** são por palavra-chave e simples. Itens fora da lista caem em "Outros".
- **Dados só no aparelho:** limpar os dados do navegador apaga tudo. Use **Ajustes → Exportar** de vez em quando. Não há sincronização entre aparelhos.
- A projeção anual de corte usa o período das suas notas; com menos de 4 semanas o app avisa que é grosseira.
- Sem busca de preço em outras lojas além das que você mesmo comprou.

## Privacidade e LGPD

Os dados de compra ficam no aparelho do usuário e não passam por nenhum servidor seu, o que reduz muito a exposição. Mesmo assim:

- O proxy enxerga o endereço da nota que o usuário consulta (que contém a chave de acesso). Diga isso numa política de privacidade.
- Se um dia houver login, nuvem, anúncios, parcerias com marcas ou venda de dados agregados, o cenário muda e exige consentimento claro e revisão jurídica **antes**.
- O CPF pode aparecer na nota. O app não o guarda, mas ele passa pelo texto que o usuário cola: avise para não compartilhar o texto com ninguém.

Isto não é aconselhamento jurídico: peça a revisão de um advogado antes de abrir para o público.

## Estrutura

```
app/       index.html, app.js (interface), parser.js (leitor da nota), core.js (análises),
           sw.js (funciona sem internet), manifest e ícone
worker/    worker.js (proxy) e wrangler.toml
tests/     unit.test.js (sem navegador) e browser.test.js (precisa de playwright)
```

## Próximos passos sugeridos (só depois do piloto)

1. Editar nome e categoria de um produto e unir produtos duplicados.
2. Envio da nota por WhatsApp ou e-mail para reduzir o esforço de escanear.
3. Leitura da foto da nota (plano B) com modelo de visão, mostrando a imagem ao lado dos dados lidos.
4. Gráfico de preço por produto ao longo do tempo.

## Desempenho e janela de análise (v0.9)

- **Janela de 12 meses:** variação de preço, inflação pessoal, comparação entre lojas e potencial de corte usam só as notas dos últimos 12 meses, contados a partir da nota mais recente (`Core.windowPurchases`). Sem isso, anos de histórico viram uma inflação acumulada que não se compara com o IPCA de 12 meses. A busca "Quanto paguei?", o gráfico de histórico (dentro da janela), a meta e as listas por mês continuam vendo o que cada uma precisa.
- **Lista de compras:** o ritmo de cada produto vem das últimas 6 compras, e quem não é comprado há mais de 90 dias e mais de 3 intervalos sai da lista.
- **Cache do agrupamento de produtos:** a chave é uma assinatura do conteúdo das notas e dos ajustes (`assinatura` em `core.js`), então não depende de avisar "mudou". Há testes que comparam o resultado com um módulo sem cache depois de cada tipo de alteração.
- **Aba Compras:** mostra as 20 notas mais recentes ("Ver mais notas") e monta os itens de cada nota só ao abrir.
- Medido no Chromium com CPU 4x mais lenta, 1 nota a cada 3,5 dias: com 150 notas, Compras 2,7 s → 0,05 s e Resumo 0,8 s → 0,2 s.

## Lista de compras (v0.12)

- A lista agora é guardada no aparelho (`lista` em `notas.v1`, entra no backup): itens com produto conhecido (`key`), quantidade, preço manual opcional e marca de "no carrinho".
- Qualquer produto já comprado pode entrar (busca ou "mais comprados"); o que nunca foi comprado entra como item novo, com preço opcional.
- Estimativa: quantidade × último preço registrado; item novo usa o preço digitado; item sem preço fica fora da conta e é avisado. Separa "Falta pegar" e "No carrinho".
- Marcar no mercado move o item para "No carrinho". "Enviar lista" manda só o que falta pegar.
- "Provavelmente acabando" virou sugestão (adicionar um a um ou todos). A seleção antiga (`listaSel`) é migrada para itens.
- Teste em celular real ainda pendente (só Playwright).

## Anotar rápido (v0.13)

- A tela inicial tem o cartão "Lista de compras": campo para anotar o que falta, com sugestões dos produtos já comprados e opção "Anotar como novo". Enter anota o primeiro produto conhecido ou, se não houver, um item novo. Repetido não duplica.
- O botão do cartão mostra quantos itens faltam pegar e abre a lista.
- Android: pressionar o ícone do app mostra "Anotar na lista" (`shortcuts` no manifesto, abre `?anotar=1` com o campo em foco). No iPhone não existe esse recurso.
- Sem notificações push de propósito: exigiriam servidor e identificar a pessoa.
