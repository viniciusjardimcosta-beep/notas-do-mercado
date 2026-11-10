// Teste de ponta a ponta no Chromium. Rodar: node tests/browser.test.js
// ATENÇÃO: o HTML abaixo é SINTÉTICO (feito de memória do layout comum das NFC-e). Não prova que as páginas reais funcionam.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', 'app');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((q, s) => {
  const p = q.url.split('?')[0];
  const f = path.join(root, p === '/' ? 'index.html' : p);
  if (!f.startsWith(root) || !fs.existsSync(f)) { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'text/plain' }); s.end(fs.readFileSync(f));
});

function nota(itens, data, loja) {
  const linhas = itens.map(i => `<tr><td><span class="txtTit">${i[0]}</span><span class="RCod">(Código: ${i[1]})</span><span class="Rqtd"><strong>Qtde.:</strong>${String(i[2]).replace('.', ',')}</span><span class="RUN"><strong>UN: </strong>UN</span><span class="RvlUnit"><strong>Vl. Unit.:</strong>${i[3].toFixed(2).replace('.', ',')}</span></td><td class="valor">${(i[2] * i[3]).toFixed(2).replace('.', ',')}</td></tr>`).join('');
  const total = itens.reduce((s, i) => s + i[2] * i[3], 0).toFixed(2).replace('.', ',');
  return `<html><body><div class="txtTopo">${loja}</div><div>CNPJ: 01.234.567/0001-90</div><table id="tabResult">${linhas}</table><div>Valor a pagar R$: ${total}</div><div>Emissão: ${data} 10:00:00</div></body></html>`;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  // nos testes principais não há proxy padrão (o app em produção traz um no index.html)
  await ctx.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(base);
  // os primeiros testes exercitam a tela de conferência, então começam com salvar automático desligado
  await page.evaluate(() => localStorage.setItem('notas.v1', JSON.stringify({ auto: false })));
  await page.reload();

  // 0) primeira abertura: tela de boas-vindas
  await page.waitForSelector('text=Bem-vindo');
  assert.ok(/Política de privacidade/.test(await page.innerText('#view')));
  await page.click('text=Entendi, começar');
  await page.waitForSelector('text=1. Escanear');
  console.log('ok   boas-vindas na primeira abertura');

  // 1) parseDoc com HTML (estratégia por classes)
  const html = nota([['BISC REC OREO 90G', '7622300', 2, 3.49], ['LEITE INTEGRAL 1L', '789', 6, 5.49]], '03/10/2026', 'MERCADO TESTE');
  const r = await page.evaluate(h => NFParser.parseAny(h), html);
  assert.strictEqual(r.items.length, 2, 'itens: ' + JSON.stringify(r));
  assert.strictEqual(r.strategy, 'classes');
  assert.strictEqual(r.items[1].vlTotal, 32.94);
  assert.strictEqual(r.store.name, 'MERCADO TESTE');
  assert.strictEqual(r.date, '2026-10-03');
  console.log('ok   parseDoc por classes');

  // 1b) página real do RS usa .txtTit também no rótulo "Vl. Total": não pode virar item
  const htmlDup = html.replace(/<td class="valor">([^<]*)<\/td>/g, '<td class="valor"><span class="txtTit">Vl. Total</span> $1</td>')
    .replace(/<td class="valor">/g, '<td class="valor">');
  const rd = await page.evaluate(h => NFParser.parseAny(h), htmlDup);
  assert.strictEqual(rd.items.length, 2, 'itens duplicados: ' + JSON.stringify(rd.items.map(i => i.nome)));
  assert.ok(rd.items.every(i => !/^Vl\./i.test(i.nome)));
  assert.deepStrictEqual(rd.warnings, []);
  console.log('ok   rótulo Vl. Total com classe txtTit não vira item');

  // 2) fluxo da interface: colar texto -> conferir -> salvar -> resumo
  const dados = [
    ['2026-08-05', [['BISC REC OREO 90G', '7622300', 2, 3.00], ['ARROZ TIPO 1 5KG', '1', 1, 25.00], ['LEITE INTEGRAL 1L', '2', 6, 5.00], ['REFRIG GUARANA 2L', '3', 2, 7.00]]],
    ['2026-09-05', [['BISC REC OREO 90G', '7622300', 2, 3.30], ['ARROZ TIPO 1 5KG', '1', 1, 27.50], ['LEITE INTEGRAL 1L', '2', 6, 5.20], ['REFRIG GUARANA 2L', '3', 2, 7.60]]],
    ['2026-10-05', [['BISC REC OREO 90G', '7622300', 1, 2.90], ['ARROZ TIPO 1 5KG', '1', 1, 26.00], ['LEITE INTEGRAL 1L', '2', 6, 5.50], ['REFRIG GUARANA 2L', '3', 2, 8.00]]]
  ];
  for (let k = 0; k < dados.length; k++) {
    await page.click('nav button[data-t=add]');
    await page.click('summary');
    await page.fill('textarea', nota(dados[k][1], dados[k][0].split('-').reverse().join('/'), 'MERCADO ' + (k === 2 ? 'B' : 'A')));
    await page.click('text=Ler texto colado');
    await page.waitForSelector('text=Confira antes de salvar');
    await page.click('text=Salvar nota');
    await page.waitForSelector('text=Gasto em');
  }
  const home = await page.innerText('#view');
  assert.ok(/Sua inflação do mercado/.test(home));
  assert.ok(/\+\d+,\d%/.test(home), 'inflação pessoal deveria aparecer: ' + home);
  assert.ok(/cortáveis/.test(home) && /cortar/i.test(home));
  assert.ok(/Biscoitos, salgadinhos e doces/.test(home));
  console.log('ok   fluxo: 3 notas salvas, resumo com inflação e corte');

  // 3) preços
  await page.click('nav button[data-t=prices]');
  const prices = await page.innerText('#view');
  assert.ok(/O que mudou de preço/.test(prices) && /LEITE INTEGRAL 1L|OREO/.test(prices));
  assert.ok(/Onde ficou mais barato/.test(prices));
  assert.ok(/Ver histórico \(3 compras\)/.test(prices), 'deveria oferecer histórico');
  assert.ok(await page.locator('details.hist svg[role=img]').count() >= 1, 'gráfico de preço deveria existir');
  const rotuloGrafico = await page.locator('details.hist svg').first().getAttribute('aria-label');
  assert.ok(/Preço por (kg|litro|un) em 3 compras/.test(rotuloGrafico), rotuloGrafico);
  assert.strictEqual(await page.locator('details.hist').first().locator('svg circle.pt').count(), 3);
  // toque em um ponto mostra data, preço e loja (no celular não existe tooltip de mouse)
  const h0 = page.locator('details.hist').first();
  await h0.locator('summary').click();
  const antes = await h0.locator('.hist-info').innerText();
  assert.ok(/\d{2}\/\d{2}\/\d{4} · R\$/.test(antes) && /MERCADO/i.test(antes), 'último ponto vem selecionado: ' + antes);
  await h0.locator('circle.hit').first().click();
  const depois = await h0.locator('.hist-info').innerText();
  assert.ok(/MERCADO/i.test(depois) && depois !== antes, 'tocar no 1º ponto mostra a primeira compra: ' + depois);
  assert.strictEqual(await h0.locator('circle.pt').first().getAttribute('r'), '5.5');
  console.log('ok   tela de preços e gráfico de histórico');

  // 3b) "Quanto paguei?": busca, última compra, menor preço e comparação com o preço da prateleira
  assert.ok(/Quanto paguei\?/.test(prices));
  const busca = page.locator('input[type=search]');
  await busca.fill('lei');
  assert.ok(/Última vez: R\$\s5,50 · 05\/10\/2026 · MERCADO B/.test(await page.innerText('#view')), 'última compra do leite');
  assert.ok(/Menor preço: R\$\s5,00 · 05\/08\/2026 · MERCADO A/.test(await page.innerText('#view')), 'menor preço do leite');
  await busca.fill('LEITE integral');
  const agora = page.locator('input[aria-label^="Preço na prateleira agora"]').first();
  await agora.fill('5,80');
  let cmpTxt = await page.locator('.cmp').first().innerText();
  assert.ok(/\+5,5% mais caro que da última vez/.test(cmpTxt) && /\+16,0% em relação ao menor preço/.test(cmpTxt), cmpTxt);
  await agora.fill('4,90');
  cmpTxt = await page.locator('.cmp').first().innerText();
  assert.ok(/mais barato que da última vez/.test(cmpTxt) && /abaixo do menor preço que você já pagou/.test(cmpTxt), cmpTxt);
  await agora.fill('abc');
  assert.strictEqual((await page.locator('.cmp').first().innerText()).trim(), '', 'valor inválido não mostra comparação');
  await busca.fill('café');
  assert.ok(/Não achei esse produto/.test(await page.innerText('#view')));
  await busca.fill('');
  assert.ok(/Digite o nome de um produto/.test(await page.innerText('#view')));
  console.log('ok   busca Quanto paguei');

  // 3b) Compras mostra a categoria de cada item e deixa corrigir; vale para o produto todo
  await page.click('nav button[data-t=buys]');
  assert.ok(/MERCADO A/.test(await page.innerText('#view')), 'nome da loja deveria aparecer');
  await page.locator('details summary').first().click();
  const selG = () => page.locator('select[aria-label="Categoria de REFRIG GUARANA 2L"]').first();
  assert.strictEqual(await selG().inputValue(), 'refri');
  await selG().selectOption('bebidas');
  assert.strictEqual(await selG().inputValue(), 'bebidas', 'a nota deveria continuar aberta com a categoria nova');
  await page.click('nav button[data-t=home]');
  assert.ok(!/Refrigerantes e energéticos/.test(await page.innerText('#view')), 'resumo deveria refletir a correção');
  console.log('ok   categoria por item corrigida e refletida no resumo');

  // 4) duplicata bloqueada
  await page.click('nav button[data-t=add]');
  await page.click('summary');
  const txt = 'MERCADO X CNPJ: 01.234.567/0001-90\nARROZ 5KG (Código: 1) Qtde.: 1 UN: UN Vl. Unit.: 25,00 Vl. Total 25,00\nValor a pagar R$ 25,00\nEmissão: 05/08/2026 ' + '4326110123456700019065001000000123100000012' + '4';
  await page.fill('textarea', txt);
  await page.click('text=Ler texto colado');
  await page.waitForSelector('text=Confira antes de salvar');
  assert.strictEqual(await page.inputValue('input[aria-label="Nome da loja"]'), 'MERCADO X');
  await page.click('text=Descartar');
  console.log('ok   revisão e descarte');

  // 4b) sem proxy, o endereço lido vira botão "Abrir a nota" e abre o plano B
  await page.click('nav button[data-t=add]');
  await page.fill('input[type=text]', 'https://www.fazenda.exemplo.gov.br/nfce?p=' + '4326110123456700019065001000000123100000012' + '4|2|1');
  await page.click('text=Buscar nota');
  await page.waitForSelector('text=QR Code lido');
  assert.ok((await page.getAttribute('a:has-text("Abrir a nota")', 'href')).startsWith('https://www.fazenda.exemplo.gov.br'));
  assert.ok(await page.evaluate(() => document.querySelector('details').open), 'plano B deveria abrir');
  console.log('ok   sem proxy: mostra botão Abrir a nota');

  // 5) dados persistem após recarregar
  await page.reload();
  await page.waitForSelector('text=Gasto em');
  assert.ok(/3 notas guardadas/.test(await page.innerText('#sub')));
  console.log('ok   persistência após recarregar');

  // 6) texto malicioso no nome do produto não vira HTML
  await page.evaluate(() => { window.__x = 0; });
  await page.click('nav button[data-t=add]');
  await page.click('summary');
  await page.fill('textarea', 'LOJA CNPJ: 01.234.567/0001-90\n<img src=x onerror="window.__x=1"> (Código: 9) Qtde.: 1 UN: UN Vl. Unit.: 1,00 Vl. Total 1,00\nValor a pagar R$ 1,00\nEmissão: 01/10/2026');
  await page.click('text=Ler texto colado');
  await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => window.__x), 0);
  console.log('ok   nomes de produto não executam HTML');

  // 6b) salvar automático: salva sozinho, tem Desfazer e bloqueia repetida
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('notas.v1')); s.auto = true; localStorage.setItem('notas.v1', JSON.stringify(s)); });
  await page.reload();
  const colar = async (html) => {
    await page.click('nav button[data-t=add]');
    await page.click('summary');
    await page.fill('textarea', html);
    await page.click('text=Ler texto colado');
  };
  const pao = nota([['PAO FRANCES', '9', 0.5, 14.9]], '10/10/2026', 'MERCADO Z');
  await colar(pao);
  await page.waitForSelector('#toast');
  assert.ok(/Nota salva/.test(await page.innerText('#toast')));
  assert.ok(/4 notas guardadas/.test(await page.innerText('#sub')));
  await page.click('#toast button');
  assert.ok(/3 notas guardadas/.test(await page.innerText('#sub')), 'Desfazer deveria remover a nota');
  await colar(pao);
  await page.waitForSelector('#toast');
  assert.ok(/4 notas guardadas/.test(await page.innerText('#sub')));
  await colar(pao);
  await page.waitForSelector('text=já estava salva');
  assert.ok(/4 notas guardadas/.test(await page.innerText('#sub')), 'repetida não pode duplicar');
  console.log('ok   salvar automático, desfazer e bloqueio de repetida');

  // 6c) projeção anual não aparece com poucos dias de notas (aqui há mais de 28 dias: aparece)
  await page.click('nav button[data-t=home]');
  assert.ok(/por ano/.test(await page.innerText('#view')));

  // 6d) compartilhar para o app: endereço chega por ?text= e a query é limpa
  const link = 'https://www.fazenda.exemplo.gov.br/nfce?p=4326110123456700019065001000000123100000012' + '4|2|1';
  await page.goto(base + '?text=' + encodeURIComponent('Nota fiscal ' + link));
  await page.waitForSelector('text=QR Code lido');
  assert.ok(!page.url().includes('text='), 'a query deveria ser limpa');
  console.log('ok   compartilhar para o app');

  // 6e) proxy padrão do app: sem configurar nada em Ajustes, escanear busca e salva sozinho
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page2 = await ctx2.newPage();
  let pedidos = [];
  await page2.route('https://notas-proxy.caderninhodomercado.workers.dev/**', route => {
    pedidos.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', headers: { 'access-control-allow-origin': '*' },
      body: nota([['ARROZ 5KG', '1', 1, 25.0], ['LEITE 1L', '2', 2, 5.0]], '20/10/2026', 'MERCADO PADRAO') });
  });
  await page2.goto(base);
  await page2.click('text=Entendi, começar');
  await page2.fill('input[type=text]', 'https://www.fazenda.exemplo.gov.br/nfce?p=4326110123456700019065001000000123100000012' + '9|2|1');
  await page2.click('text=Buscar nota');
  await page2.waitForSelector('#toast');
  assert.ok(/Nota salva: 2 itens/.test(await page2.innerText('#toast')), await page2.innerText('#toast'));
  assert.strictEqual(pedidos.length, 1);
  assert.ok(/\?u=https%3A%2F%2Fwww\.fazenda/.test(pedidos[0]));
  await ctx2.close();
  console.log('ok   proxy padrão: busca e salva sem configurar');

  // 6e2) estado ainda não testado: erro do site traz aviso com a UF; no RS não
  const dv = function (p43) { let s = 0, w = 2; for (let i = 42; i >= 0; i--) { s += +p43[i] * w; w = w === 9 ? 2 : w + 1; } const r = s % 11; return p43 + (r < 2 ? 0 : 11 - r); };
  const chSC = dv('4226110123456700019065001000000123100000012'), chRS = dv('4326110123456700019065001000000123100000012');
  for (const [ch, esperaAviso] of [[chSC, true], [chRS, false]]) {
    const cx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    const pg = await cx.newPage();
    await pg.route('https://notas-proxy.caderninhodomercado.workers.dev/**', route => route.fulfill({ status: 502, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'erro' }));
    await pg.goto(base);
    await pg.click('text=Entendi, começar');
    await pg.fill('input[type=text]', 'https://www.fazenda.exemplo.gov.br/nfce?p=' + ch + '|2|1');
    await pg.click('text=Buscar nota');
    await pg.waitForSelector('text=respondeu com erro 502');
    const txt = await pg.innerText('#view');
    assert.strictEqual(/testando a leitura automática em SC/.test(txt), esperaAviso, txt);
    assert.ok(/plano B/.test(txt));
    await cx.close();
  }
  console.log('ok   aviso de estado ainda não testado');

  // 6f) relatório de problema remove CPF
  await page.click('nav button[data-t=add]');
  await page.click('summary');
  await page.fill('textarea', 'LOJA CNPJ: 01.234.567/0001-90\nCONSUMIDOR CPF: 123.456.789-09\nARROZ (Código: 1) Qtde.: 1 UN: UN Vl. Unit.: 20,00 Vl. Total 20,00\nValor a pagar R$ 20,00\nEmissão: 11/10/2026');
  await page.click('text=Ler texto colado');
  await page.waitForTimeout(300);
  await page.click('nav button[data-t=cfg]');
  const rel = await page.inputValue('textarea[aria-label="Texto do relatório"]');
  assert.ok(rel.length > 20 && !/123\.456\.789-09/.test(rel), 'CPF não pode aparecer: ' + rel);
  console.log('ok   relatório de problema sem CPF');

  // 6g) refazer categorias automáticas apaga as correções feitas à mão
  assert.ok(Object.keys(await page.evaluate(() => JSON.parse(localStorage.getItem('notas.v1')).overrides)).length > 0, 'deveria haver correção manual do teste anterior');
  page.once('dialog', d => d.accept());
  await page.click('text=Refazer categorias automáticas');
  assert.deepStrictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('notas.v1')).overrides), {});
  console.log('ok   refazer categorias automáticas');

  // 6h) backup: lembrete, menu Compartilhar, download de reserva e "lembrar depois"
  await page.click('nav button[data-t=home]');
  assert.ok(/Faça um backup/.test(await page.innerText('#view')), 'lembrete de backup deveria aparecer');
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async d => { window.__shared = d.files.map(f => f.name); }; });
  await page.click('#view >> text=Fazer backup');
  await page.waitForFunction(() => window.__shared);
  assert.ok(/^notas-\d{4}-\d{2}-\d{2}\.json$/.test(await page.evaluate(() => window.__shared[0])));
  assert.ok(await page.evaluate(() => !!JSON.parse(localStorage.getItem('notas.v1')).lastBackup));
  assert.ok(!/Faça um backup/.test(await page.innerText('#view')), 'lembrete some depois do backup');
  await page.click('nav button[data-t=cfg]');
  assert.ok(!/Último backup: nunca/.test(await page.innerText('#view')));
  await page.evaluate(() => { navigator.canShare = undefined; });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#view >> text=Fazer backup')]);
  assert.ok(/^notas-.*\.json$/.test(dl.suggestedFilename()));
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('notas.v1')); s.lastBackup = ''; localStorage.setItem('notas.v1', JSON.stringify(s)); });
  await page.reload(); await page.waitForSelector('text=Faça um backup');
  await page.click('text=Lembrar depois');
  assert.ok(!/Faça um backup/.test(await page.innerText('#view')));
  console.log('ok   backup por compartilhamento, download de reserva e lembrete');

  // 6i) produtos: sugestão de união, unir, renomear e separar; comparação mensal só com notas suficientes
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx3.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; });
  const p3 = await ctx3.newPage();
  await p3.goto(base);
  await p3.evaluate(() => {
    const it = (nome, vu) => ({ nome, codigo: '', qtd: 1, un: 'UN', vlUnit: vu, vlTotal: vu });
    localStorage.setItem('notas.v1', JSON.stringify({ seen: true, auto: false, purchases: [
      { id: 'a', date: '2026-09-01', store: { name: 'M', cnpj: '1' }, total: 5, items: [it('LEITE INTEGRAL PARMALAT 1L', 5)] },
      { id: 'b', date: '2026-10-01', store: { name: 'M', cnpj: '1' }, total: 5.5, items: [it('LEITE INTEGRAL 1L', 5.5)] }] }));
  });
  await p3.reload();
  assert.ok(/pelo menos 2 notas em cada mês/.test(await p3.innerText('#view')), 'sem notas suficientes não compara meses');
  await p3.click('nav button[data-t=prices]');
  await p3.waitForSelector('text=Será que são o mesmo produto?');
  await p3.click('button.primary:has-text("Unir")');
  await p3.waitForSelector('text=+10,0%');
  assert.ok(/Junta:/.test(await p3.innerText('#view')));
  p3.once('dialog', d => d.accept('Leite barato'));
  await p3.click('button:has-text("Renomear")');
  await p3.waitForSelector('text=Leite barato');
  await p3.click('button:has-text("Separar")');
  await p3.waitForSelector('text=Será que são o mesmo produto?');
  assert.ok(!/\+10,0%/.test(await p3.innerText('#view')));
  await p3.click('button:has-text("Não são")');
  assert.ok(!/Será que são o mesmo produto\?/.test(await p3.innerText('#view')), '"Não são" tira a sugestão');
  await ctx3.close();
  console.log('ok   produtos: sugerir, unir, renomear, separar; comparação mensal só com notas suficientes');

  // 6i2) meta mensal: define, acompanha, altera, valida e remove (data fixa em 15/11/2026)
  const ctxM = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const mkNota = (id, d, v) => ({ id, date: d, store: { name: 'MERCADO A', cnpj: '1' }, total: v, items: [{ nome: 'ARROZ TIPO 1 5KG', codigo: '1', qtd: 1, un: 'UN', vlUnit: v, vlTotal: v }] });
  await ctxM.addInitScript(s => { window.NOTAS_CONFIG = { proxy: '' }; if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(s)); },
    { purchases: [mkNota('a', '2026-11-03', 400), mkNota('b', '2026-11-10', 212), mkNota('c', '2026-10-20', 999)], seen: true });
  const pM = await ctxM.newPage();
  await pM.clock.setFixedTime(new Date('2026-11-15T12:00:00'));
  await pM.goto(base);
  assert.ok(/Meta do mês/.test(await pM.innerText('#view')) && await pM.locator('button:has-text("Definir meta")').count() === 1);
  await pM.click('button:has-text("Definir meta")');
  await pM.fill('input[aria-label^="Meta de gasto"]', 'abc');
  await pM.click('button:has-text("Salvar meta")');
  assert.ok(await pM.locator('text=Digite um valor em reais').isVisible(), 'valor inválido mostra erro');
  await pM.fill('input[aria-label^="Meta de gasto"]', '900');
  await pM.click('button:has-text("Salvar meta")');
  let vM = await pM.innerText('#view');
  assert.ok(/R\$\s612,00 de R\$\s900,00/.test(vM), vM);
  assert.ok(/Usou 68% da meta\. Restam R\$\s288,00/.test(vM) && /faltam 15 dias/.test(vM), vM);
  assert.ok(/fecharia em cerca de R\$\s1\.224,00, acima da meta/.test(vM), vM);
  assert.strictEqual(await pM.locator('[role=progressbar]').getAttribute('aria-valuenow'), '612');
  await pM.reload();
  assert.ok(/R\$\s612,00 de R\$\s900,00/.test(await pM.innerText('#view')), 'meta persiste');
  await pM.click('button:has-text("Alterar meta")');
  await pM.fill('input[aria-label^="Meta de gasto"]', '500,00');
  await pM.click('button:has-text("Salvar meta")');
  vM = await pM.innerText('#view');
  assert.ok(/Passou R\$\s112,00 da meta \(122%\)/.test(vM), vM);
  assert.ok(await pM.locator('.meta-bar.passou').count() === 1);
  await pM.click('button:has-text("Alterar meta")');
  await pM.fill('input[aria-label^="Meta de gasto"]', '1.200,50');
  await pM.click('button:has-text("Salvar meta")');
  assert.ok(/de R\$\s1\.200,50/.test(await pM.innerText('#view')));
  await pM.click('button:has-text("Alterar meta")');
  await pM.click('button:has-text("Remover")');
  assert.strictEqual(await pM.locator('button:has-text("Definir meta")').count(), 1, 'remover volta ao estado sem meta');
  await ctxM.close();
  console.log('ok   meta mensal');

  // 6i3) embalagem menor + lista de compras (data fixa em 07/11/2026)
  const ctxL = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const mkIt = (nome, cod, v) => ({ nome, codigo: cod, qtd: 1, un: 'UN', vlUnit: v, vlTotal: v });
  const mkN = (id, d, loja, itens) => ({ id, date: d, store: { name: loja, cnpj: '1' }, total: itens.reduce((s, i) => s + i.vlTotal, 0), items: itens });
  await ctxL.addInitScript(s => {
    window.NOTAS_CONFIG = { proxy: '' };
    navigator.share = async d => { window.__listaShare = d; };
    if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(s));
  }, { seen: true, purchases: [
    mkN('a', '2026-08-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.0), mkIt('ARROZ TIPO 1 5KG', '1', 25.0)]),
    mkN('b', '2026-09-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.2), mkIt('ARROZ TIPO 1 5KG', '1', 27.5), mkIt('BISC REC OREO 90G', '7622300', 3.30)]),
    mkN('c', '2026-10-05', 'MERCADO B', [mkIt('LEITE INTEGRAL 1L', '2', 5.5), mkIt('ARROZ TIPO 1 5KG', '1', 26.0), mkIt('BISC REC OREO 80G', '7622301', 3.30)])
  ] });
  const pL = await ctxL.newPage();
  await pL.clock.setFixedTime(new Date('2026-11-07T12:00:00'));
  await pL.goto(base);
  let vL = await pL.innerText('#view');
  assert.ok(/Embalagem menor, preço maior/.test(vL) && /90 g → 80 g \(-11,1% de conteúdo\)/.test(vL), vL);
  assert.ok(/Embalagem: R\$\s3,30 → R\$\s3,30 \(mesmo preço\)/.test(vL) && /Por kg: R\$\s36,67 → R\$\s41,25 \+12,5%/.test(vL), vL);
  await pL.click('button:has-text("Ver em Preços")');
  assert.ok(/Quanto paguei\?/.test(await pL.innerText('#view')) && /Embalagem menor, preço maior/.test(await pL.innerText('#view')), 'também aparece em Preços');
  await pL.click('nav button[data-t=buys]');
  await pL.click('button:has-text("Lista de compras")');
  vL = await pL.innerText('#view');
  assert.ok(/Provavelmente acabando \(2\)/.test(vL) && /ARROZ TIPO 1 5KG/.test(vL) && /LEITE INTEGRAL 1L/.test(vL), vL);
  assert.ok(/costuma comprar a cada 31 dias/.test(vL) && /há 33 dias/.test(vL), vL);
  assert.ok(/Adicione itens para ver a estimativa/.test(vL) && await pL.locator('#lista-add').evaluate(d => d.open), 'lista vazia: painel de adicionar aberto');
  assert.ok(await pL.locator('#lista-resultados').innerText().then(t => /OREO/.test(t)), 'produto de uma data só também pode ser escolhido');
  // busca e adiciona um produto já comprado
  await pL.fill('#lista-busca', 'oreo');
  await pL.click('button[aria-label^="Adicionar à lista: BISC"]');
  vL = await pL.innerText('#view');
  assert.ok(/Falta pegar \(1\)/.test(vL) && /1 × R\$\s3,30 = R\$\s3,30/.test(vL), vL);
  // item novo, sem preço: fica de fora da conta e avisa
  await pL.fill('#lista-busca', 'Pão de forma');
  await pL.click('button:has-text("Adicionar como novo")');
  vL = await pL.innerText('#view');
  assert.ok(/Falta pegar \(2\)/.test(vL) && /1 item sem preço ficou fora da conta/.test(vL) && /Falta pegar R\$\s3,30/.test(vL), vL);
  // informa o preço do item novo
  await pL.fill('input.preco-item', '8,5'); await pL.locator('input.preco-item').dispatchEvent('change');
  vL = await pL.innerText('#view');
  assert.ok(/Falta pegar R\$\s11,80/.test(vL) && !/sem preço ficou/.test(vL), vL);
  // item novo já com preço pelo campo opcional
  await pL.fill('#lista-busca', 'Sal'); await pL.fill('#lista-preco', '3,00');
  await pL.click('button:has-text("Adicionar como novo")');
  assert.ok(/Falta pegar R\$\s14,80/.test(await pL.innerText('#view')), 'preço opcional do item novo entra na conta');
  // quantidade
  await pL.click('button[aria-label^="Aumentar quantidade de BISC"]');
  assert.ok(/2 × R\$\s3,30 = R\$\s6,60/.test(await pL.innerText('#view')) && /Falta pegar R\$\s18,10/.test(await pL.innerText('#view')));
  // marcar: sai de "Falta pegar" e vai para "No carrinho"
  await pL.click('input[aria-label="Peguei: BISC REC OREO 80G"], input[aria-label^="Peguei: BISC"]');
  vL = await pL.innerText('#view');
  assert.ok(/Falta pegar \(2\)/.test(vL) && /No carrinho \(1\)/.test(vL) && /No carrinho R\$\s6,60/.test(vL) && /Falta pegar R\$\s11,50/.test(vL), vL);
  assert.strictEqual(await pL.locator('#lista-carrinho .li.feito').count(), 1);
  // persiste ao recarregar
  await pL.reload();
  await pL.click('nav button[data-t=buys]');
  await pL.click('button:has-text("Lista de compras")');
  vL = await pL.innerText('#view');
  assert.ok(/Falta pegar \(2\)/.test(vL) && /No carrinho \(1\)/.test(vL), 'lista persiste');
  // sugestões: adiciona o arroz pelas sugestões; o leite vira escondido
  await pL.click('#lista-sugestoes button[aria-label="Adicionar à lista: ARROZ TIPO 1 5KG"]');
  assert.ok(/Provavelmente acabando \(1\)/.test(await pL.innerText('#view')) && /1 × R\$\s26,00/.test(await pL.innerText('#view')));
  await pL.locator('#lista-sugestoes button:has-text("Esconder")').first().click();
  vL = await pL.innerText('#view');
  assert.ok(!/Provavelmente acabando/.test(vL) && /Mostrar sugestões escondidas \(1\)/.test(vL), vL);
  await pL.click('button:has-text("Mostrar sugestões escondidas")');
  assert.ok(/Provavelmente acabando \(1\)/.test(await pL.innerText('#view')));
  // enviar: só o que falta pegar
  await pL.click('button:has-text("Enviar lista")');
  const comp = await pL.evaluate(() => window.__listaShare);
  assert.ok(comp && /^Lista de compras/.test(comp.text) && /ARROZ/.test(comp.text) && /Pão de forma/.test(comp.text) && !/BISC/.test(comp.text) && /Estimativa: R\$/.test(comp.text), JSON.stringify(comp));
  // tirar marcados e nova lista
  await pL.click('button:has-text("Tirar marcados")');
  assert.strictEqual(await pL.locator('#lista-carrinho').count(), 0);
  pL.once('dialog', d => d.accept());
  await pL.click('button:has-text("Nova lista")');
  assert.ok(/Adicione itens para ver a estimativa/.test(await pL.innerText('#view')));
  // migração da seleção antiga (listaSel)
  await pL.evaluate(() => {
    const k = Core.catalogo(JSON.parse(localStorage.getItem('notas.v1')).purchases, 'leite')[0].key;
    const s = JSON.parse(localStorage.getItem('notas.v1')); s.lista = []; s.listaSel = {}; s.listaSel[k] = true;
    localStorage.setItem('notas.v1', JSON.stringify(s));
  });
  await pL.reload();
  await pL.click('nav button[data-t=buys]');
  await pL.click('button:has-text("Lista de compras")');
  vL = await pL.innerText('#view');
  assert.ok(/Falta pegar \(1\)/.test(vL) && /LEITE INTEGRAL 1L/.test(vL) && /1 × R\$\s5,50/.test(vL), 'listaSel antiga vira item da lista: ' + vL);
  assert.deepStrictEqual(await pL.evaluate(() => JSON.parse(localStorage.getItem('notas.v1')).listaSel), {});
  await ctxL.close();
  console.log('ok   embalagem menor e lista de compras');

  // 6i3b) anotar rápido na tela inicial
  const ctxA = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctxA.addInitScript(s => { window.NOTAS_CONFIG = { proxy: '' }; if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(s)); }, { seen: true, purchases: [
    mkN('a', '2026-08-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.0), mkIt('CAFE TORRADO 500G', '9', 18.0)]),
    mkN('b', '2026-09-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.2), mkIt('CAFE TORRADO 500G', '9', 19.0)])
  ] });
  const pA = await ctxA.newPage();
  await pA.goto(base);
  assert.ok(/Lista de compras/.test(await pA.innerText('#anota-card')) && /Abrir lista/.test(await pA.innerText('#anota-card')));
  await pA.fill('#anota-q', 'caf');
  assert.ok(/CAFE TORRADO 500G/.test(await pA.innerText('#anota-sug')) && /Anotar como novo/.test(await pA.innerText('#anota-sug')));
  await pA.click('#anota-sug button[aria-label^="Anotar CAFE"]');
  assert.ok(/1 item · abrir/.test(await pA.innerText('#anota-card')) && (await pA.inputValue('#anota-q')) === '', 'anota e limpa o campo');
  await pA.fill('#anota-q', 'pilha'); await pA.keyboard.press('Enter');
  assert.ok(/2 itens · abrir/.test(await pA.innerText('#anota-card')), 'Enter anota item novo');
  await pA.fill('#anota-q', 'pilha'); await pA.keyboard.press('Enter');
  assert.ok(/2 itens · abrir/.test(await pA.innerText('#anota-card')), 'repetido não duplica');
  await pA.fill('#anota-q', 'leite'); await pA.keyboard.press('Enter');
  assert.ok(/3 itens · abrir/.test(await pA.innerText('#anota-card')), 'Enter usa o produto conhecido');
  await pA.reload();
  assert.ok(/3 itens · abrir/.test(await pA.innerText('#anota-card')), 'persiste');
  await pA.click('#anota-abrir');
  const vA = await pA.innerText('#view');
  assert.ok(/Falta pegar \(3\)/.test(vA) && /pilha/.test(vA) && /CAFE TORRADO 500G/.test(vA) && /LEITE INTEGRAL 1L/.test(vA), vA);
  await pA.goto(base + '?anotar=1');
  assert.strictEqual(await pA.evaluate(() => document.activeElement && document.activeElement.id), 'anota-q', 'atalho do ícone foca o campo');
  const man = JSON.parse(require('fs').readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  assert.ok(man.shortcuts && /anotar=1/.test(man.shortcuts[0].url));
  await ctxA.close();
  console.log('ok   anotar rápido na tela inicial');

  // 6i4) cartão de compartilhamento e convite
  const ctxS = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctxS.addInitScript(s => {
    window.NOTAS_CONFIG = { proxy: '' };
    navigator.canShare = d => !!(d && d.files && d.files.length);
    navigator.share = async d => {
      window.__sh = window.__sh || [];
      const r = { text: d.text || '', nfiles: d.files ? d.files.length : 0 };
      if (d.files && d.files[0]) { r.type = d.files[0].type; r.size = d.files[0].size; r.name = d.files[0].name; }
      window.__sh.push(r);
    };
    if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(s));
  }, { seen: true, purchases: [
    mkN('a', '2026-08-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.0), mkIt('ARROZ TIPO 1 5KG', '1', 25.0), mkIt('FEIJAO PRETO 1KG', '3', 8.0), mkIt('BISC REC OREO 90G', '7622300', 3.30)]),
    mkN('b', '2026-10-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.5), mkIt('ARROZ TIPO 1 5KG', '1', 27.5), mkIt('FEIJAO PRETO 1KG', '3', 8.8), mkIt('BISC REC OREO 80G', '7622301', 3.30)])
  ] });
  const pS = await ctxS.newPage();
  await pS.clock.setFixedTime(new Date('2026-11-07T12:00:00'));
  await pS.goto(base);
  assert.ok(/Mostre para um amigo/.test(await pS.innerText('#view')), 'card de compartilhar aparece com dados');
  await pS.click('button:has-text("Compartilhar imagem")');
  await pS.waitForFunction(() => window.__sh && window.__sh.length === 1);
  const sh1 = await pS.evaluate(() => window.__sh[0]);
  assert.ok(sh1.nfiles === 1 && sh1.type === 'image/png' && sh1.size > 5000 && sh1.name === 'meu-caderninho.png', JSON.stringify(sh1));
  assert.ok(/caderninhodomercado\.com\.br/.test(sh1.text), sh1.text);
  assert.ok(!/R\$|MERCADO|LEITE|ARROZ/.test(sh1.text), 'texto sem dados pessoais');
  await pS.click('nav button[data-t=cfg]');
  await pS.click('button:has-text("Indicar o app")');
  await pS.waitForFunction(() => window.__sh.length === 2);
  const sh2 = await pS.evaluate(() => window.__sh[1]);
  assert.ok(sh2.nfiles === 0 && /https:\/\/caderninhodomercado\.com\.br/.test(sh2.text), JSON.stringify(sh2));
  await ctxS.close();
  // sem dados suficientes, o card não aparece
  const ctxS2 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctxS2.addInitScript(s => {
    window.NOTAS_CONFIG = { proxy: '' };
    if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(s));
  }, { seen: true, purchases: [mkN('a', '2026-10-05', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5.0)])] });
  const pS2 = await ctxS2.newPage();
  await pS2.goto(base);
  assert.ok(!/Mostre para um amigo/.test(await pS2.innerText('#view')), 'sem dados, sem card');
  await ctxS2.close();
  console.log('ok   cartão de compartilhamento e convite');

  // 6i5) câmera: vídeo precisa estar mudo e com playsinline como propriedade (Safari do iPhone) e mostrar imagem
  const brCam = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctxC = await brCam.newContext({ viewport: { width: 390, height: 800 }, permissions: ['camera'] });
  await ctxC.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; localStorage.setItem('notas.v1', JSON.stringify({ seen: true, purchases: [] })); });
  const pC = await ctxC.newPage();
  await pC.goto(base);
  await pC.click('nav button[data-t=add]');
  await pC.click('button:has-text("Escanear QR Code da nota")');
  await pC.waitForFunction(() => { const v = document.querySelector('video'); return v && !v.hidden && v.videoWidth > 0; }, null, { timeout: 8000 });
  const vc = await pC.evaluate(() => { const v = document.querySelector('video'); return { muted: v.muted, inline: v.playsInline, w: v.videoWidth, paused: v.paused }; });
  assert.ok(vc.muted && vc.inline && vc.w > 0 && !vc.paused, JSON.stringify(vc));
  await pC.click('nav button[data-t=home]');
  const cam = await pC.evaluate(() => document.querySelectorAll('video').length);
  assert.ok(cam <= 1);
  await ctxC.close();
  // câmera negada: mensagem clara
  const ctxD = await brCam.newContext({ viewport: { width: 390, height: 800 } });
  await ctxD.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; localStorage.setItem('notas.v1', JSON.stringify({ seen: true, purchases: [] }));
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('x'), { name: 'NotReadableError' })); });
  const pD = await ctxD.newPage();
  await pD.goto(base);
  await pD.click('nav button[data-t=add]');
  await pD.click('button:has-text("Escanear QR Code da nota")');
  await pD.waitForSelector('text=sendo usada por outro app');
  await ctxD.close(); await brCam.close();
  console.log('ok   câmera: mudo, playsinline, imagem aparece e erros claros');
  // 6i6) leitor de QR embutido (sem servidor externo): iPhone não tem BarcodeDetector
  const qrB64 = require('fs').readFileSync(require('path').join(__dirname, 'fixtures', 'qr.png')).toString('base64');
  const brQ = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctxQ = await brQ.newContext({ viewport: { width: 390, height: 800 }, permissions: ['camera'] });
  const externos = [];
  await ctxQ.route(/^https?:\/\/(?!localhost)/, r => { externos.push(r.request().url()); r.abort(); });
  await ctxQ.addInitScript(() => { delete window.BarcodeDetector; window.NOTAS_CONFIG = { proxy: '' }; localStorage.setItem('notas.v1', JSON.stringify({ seen: true, purchases: [] })); });
  const pQ = await ctxQ.newPage();
  await pQ.goto(base);
  await pQ.click('nav button[data-t=add]');
  await pQ.click('button:has-text("Escanear QR Code da nota")');
  await pQ.waitForFunction(() => typeof window.jsQR === 'function', null, { timeout: 8000 });
  const lido = await pQ.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(d.data, d.width, d.height); return r && r.data;
  }, qrB64);
  assert.strictEqual(lido, "Happy 1st Birthday GeekUp Leeds! http://www.geekup.org");
  assert.ok(!/Não consegui carregar o leitor/.test(await pQ.innerText('#view')));
  assert.deepStrictEqual(externos, [], 'nenhum pedido a servidor externo: ' + externos.join(','));
  await ctxQ.close(); await brQ.close();
  console.log('ok   leitor de QR embutido decodifica sem servidor externo');

  // 6i7) migração: proxy antigo salvo em Ajustes volta ao padrão novo; proxy próprio de outro tipo é mantido
  for (const [salvo, esperado] of [['https://notas-proxy.antigo.workers.dev', 'https://notas-proxy.caderninhodomercado.workers.dev'], ['https://meu-proxy.exemplo.workers.dev', 'https://meu-proxy.exemplo.workers.dev']]) {
    const ctxM = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctxM.addInitScript(s => { if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify({ seen: true, purchases: [], proxy: s })); }, salvo);
    const pM = await ctxM.newPage();
    const pedidos = [];
    await pM.route(/workers\.dev/, r => { pedidos.push(r.request().url()); r.fulfill({ status: 502, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'x' }); });
    await pM.goto(base);
    await pM.click('nav button[data-t=add]');
    await pM.fill('input[type=url], input[placeholder*="Endereço"]', 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=43240112345678000190650010000012341000012345|2|1|1|ABC');
    await pM.click('button:has-text("Buscar nota")');
    await pM.waitForFunction(() => /erro|proxy/i.test(document.querySelector('#view').innerText));
    assert.ok(pedidos.length >= 1 && pedidos[0].startsWith(esperado + '/?u='), salvo + ' => ' + pedidos[0]);
    await ctxM.close();
  }
  console.log('ok   migração do endereço antigo do proxy');

  // 6j) modo exemplo: isolado das notas reais, com bloqueios e saída segura
  {
    const real = { seen: true, meta: 500, lastBackup: '2026-11-08T10:00:00.000Z', purchases: [
      mkN('r1', '2026-10-05', 'MERCADO REAL', [mkIt('LEITE INTEGRAL 1L', '2', 5.0), mkIt('ARROZ TIPO 1 5KG', '1', 25.0), mkIt('FEIJAO PRETO 1KG', '3', 8.0)]),
      mkN('r2', '2026-11-05', 'MERCADO REAL', [mkIt('LEITE INTEGRAL 1L', '2', 5.5), mkIt('ARROZ TIPO 1 5KG', '1', 27.5), mkIt('FEIJAO PRETO 1KG', '3', 8.8)])] };
    const ctxE = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctxE.addInitScript(r => { window.NOTAS_CONFIG = { proxy: '' }; if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(r)); }, real);
    const pE = await ctxE.newPage();
    await pE.clock.setFixedTime(new Date('2026-11-09T12:00:00'));
    await pE.goto(base);
    const antes = await pE.evaluate(() => localStorage.getItem('notas.v1'));
    // entra pelo Ajustes
    await pE.click('nav button[data-t=cfg]');
    await pE.click('button:has-text("Ver exemplo")');
    await pE.waitForSelector('.exemplo-faixa');
    assert.ok(/Dados de exemplo/.test(await pE.innerText('.exemplo-faixa')));
    assert.ok(/Exemplo com dados fictícios/.test(await pE.innerText('#sub')));
    let t = await pE.innerText('#view');
    assert.ok(/Meta do mês/.test(t) && /Embalagem menor/.test(t) && /Sua inflação do mercado/.test(t), 'exemplo mostra os recursos');
    assert.ok(!/Compartilhar imagem/.test(t) && !/Faça um backup/.test(t), 'sem compartilhar nem aviso de backup no exemplo');
    assert.ok(!/MERCADO REAL/.test(t));
    // mexe em coisas no exemplo
    await pE.click('button:has-text("Alterar meta")'); await pE.fill('input[aria-label="Meta de gasto do mês em reais"]', '1500'); await pE.click('button:has-text("Salvar meta")');
    assert.ok(/1\.500,00/.test(await pE.innerText('#view')), 'o exemplo aceita mexer');
    await pE.click('nav button[data-t=prices]');
    assert.ok(/CAFE TORRADO/.test(await pE.innerText('#view')));
    await pE.click('nav button[data-t=cfg]');
    t = await pE.innerText('#view');
    assert.ok(/Você está no exemplo/.test(t) && !/Apagar tudo/.test(t) && !/Importar/.test(t) && !/Fazer backup/.test(t), 'ajustes do exemplo sem dados nem backup');
    assert.strictEqual(await pE.evaluate(() => localStorage.getItem('notas.v1')), antes, 'nada foi gravado durante o exemplo');
    // adicionar nota sai do exemplo
    await pE.click('nav button[data-t=add]');
    assert.strictEqual(await pE.locator('.exemplo-faixa').count(), 0, 'adicionar sai do exemplo');
    assert.ok(/2 notas guardadas/.test(await pE.innerText('#sub')));
    assert.strictEqual(await pE.evaluate(() => localStorage.getItem('notas.v1')), antes, 'dados reais idênticos depois de sair');
    // volta ao exemplo e sai pelo botão
    await pE.click('nav button[data-t=cfg]'); await pE.click('button:has-text("Ver exemplo")'); await pE.waitForSelector('.exemplo-faixa');
    await pE.click('.exemplo-faixa button:has-text("Sair do exemplo")');
    assert.strictEqual(await pE.locator('.exemplo-faixa').count(), 0);
    t = await pE.innerText('#view');
    assert.ok(/Meta do mês/.test(t) && /500,00/.test(t) && !/1\.500,00/.test(t), 'meta real preservada');
    assert.strictEqual(await pE.evaluate(() => localStorage.getItem('notas.v1')), antes);
    await ctxE.close();

    // aparelho vazio: convite na tela inicial, nada é gravado, sair volta às boas-vindas
    const ctxV = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctxV.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; });
    const pV = await ctxV.newPage(); await pV.goto(base);
    assert.ok(/Bem-vindo/.test(await pV.innerText('#view')));
    await pV.click('button:has-text("Ver com dados de exemplo")'); await pV.waitForSelector('.exemplo-faixa');
    assert.ok(/Sua inflação do mercado/.test(await pV.innerText('#view')));
    assert.strictEqual(await pV.evaluate(() => localStorage.getItem('notas.v1')), null, 'exemplo não grava nada em aparelho vazio');
    await pV.click('.exemplo-faixa button:has-text("Sair do exemplo")');
    assert.ok(/Bem-vindo/.test(await pV.innerText('#view')));
    assert.strictEqual(await pV.evaluate(() => localStorage.getItem('notas.v1')), null);
    await ctxV.close();

    // entrada por /?exemplo (link da página de apresentação): entra no exemplo e limpa o endereço; recarregar volta ao normal
    const ctxU = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctxU.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; });
    const pU = await ctxU.newPage(); await pU.goto(base + '?exemplo');
    await pU.waitForSelector('.exemplo-faixa');
    assert.ok(!/exemplo/.test(await pU.evaluate(() => location.search)), 'a URL é limpa');
    await pU.reload();
    assert.strictEqual(await pU.locator('.exemplo-faixa').count(), 0, 'recarregar sai do exemplo');
    assert.strictEqual(await pU.evaluate(() => localStorage.getItem('notas.v1')), null);
    await ctxU.close();
  }
  console.log('ok   modo exemplo isolado das notas reais');

  // 6i4) muitas notas: aba Compras mostra as 20 mais recentes, monta itens só ao abrir; cálculos usam todas
  const ctxV = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const muitas = []; for (let i = 0; i < 45; i++) muitas.push(mkN('v' + i, new Date(Date.UTC(2026, 0, 1 + i * 6)).toISOString().slice(0, 10), 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 5 + (i % 5) / 10), mkIt('ARROZ TIPO 1 5KG', '1', 25 + (i % 4)), mkIt('FEIJAO CARIOCA 1KG', '3', 8 + (i % 3) / 10)]));
  muitas.unshift(mkN('antiga', '2023-02-01', 'MERCADO A', [mkIt('LEITE INTEGRAL 1L', '2', 2.0)]));
  await ctxV.addInitScript(s => { window.NOTAS_CONFIG = { proxy: '' }; if (!localStorage.getItem('notas.v1')) localStorage.setItem('notas.v1', JSON.stringify(s)); }, { seen: true, purchases: muitas });
  const pV = await ctxV.newPage();
  await pV.goto(base);
  assert.ok(/46 notas guardadas/.test(await pV.innerText('#sub')));
  assert.ok(/nos últimos 12 meses de notas/.test(await pV.innerText('#view')), 'texto do período na inflação');
  await pV.click('nav button[data-t=buys]');
  assert.strictEqual(await pV.locator('details.card').count(), 20);
  assert.strictEqual(await pV.locator('details.card select').count(), 0, 'itens só são montados quando a nota abre');
  assert.ok(/Ver mais notas \(26 restantes\)/.test(await pV.innerText('#view')));
  await pV.locator('details.card summary').first().click();
  await pV.waitForSelector('details.card select'); // o evento "toggle" é assíncrono
  assert.strictEqual(await pV.locator('details.card select').count(), 3, 'abrir monta os itens');
  await pV.locator('details.card summary').first().click();
  await pV.locator('details.card summary').first().click();
  await pV.waitForFunction(() => document.querySelector('details.card').open);
  assert.strictEqual(await pV.locator('details.card select').count(), 3, 'fechar e abrir de novo não duplica os itens');
  await pV.click('button:has-text("Ver mais notas")');
  assert.strictEqual(await pV.locator('details.card').count(), 40);
  await pV.click('button:has-text("Ver mais notas")');
  assert.strictEqual(await pV.locator('details.card').count(), 46);
  assert.strictEqual(await pV.locator('button:has-text("Ver mais notas")').count(), 0);
  await pV.click('nav button[data-t=prices]');
  const precosV = await pV.innerText('#view');
  assert.ok(/LEITE INTEGRAL 1L[\s\S]*por litro/.test(precosV) && !/R\$\s2,00 →/.test(precosV), 'a nota de 2023 não entra na variação de preço: ' + precosV.slice(0, 600));
  await pV.fill('input[type=search]', 'leite');
  assert.ok(/46 compras nas suas notas|45 compras nas suas notas/.test(await pV.innerText('#view')) || /compras nas suas notas/.test(await pV.innerText('#view')), 'a busca enxerga todo o histórico');
  await ctxV.close();
  console.log('ok   muitas notas: paginação, itens sob demanda e janela de 12 meses');

  // 6j) alerta de aumento depois de salvar uma nota
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await ctx4.addInitScript(() => { window.NOTAS_CONFIG = { proxy: '' }; });
  const p4 = await ctx4.newPage();
  await p4.goto(base);
  await p4.evaluate(() => localStorage.setItem('notas.v1', JSON.stringify({ seen: true, purchases: [
    { id: 'a', date: '2026-09-01', store: { name: 'M', cnpj: '1' }, total: 5, items: [{ nome: 'LEITE', codigo: '', qtd: 1, un: 'UN', vlUnit: 5, vlTotal: 5 }] }] })));
  await p4.reload();
  await p4.click('nav button[data-t=add]');
  await p4.click('summary');
  await p4.fill('textarea', 'MERCADO X CNPJ: 01.234.567/0001-90\nLEITE (Código: 2) Qtde.: 1 UN: UN Vl. Unit.: 5,80 Vl. Total 5,80\nValor a pagar R$ 5,80\nEmissão: 06/10/2026');
  await p4.click('text=Ler texto colado');
  await p4.waitForSelector('text=O que ficou mais caro nesta nota');
  assert.ok(/LEITE[\s\S]*\+16,0%/.test(await p4.innerText('#view')));
  await p4.click('button:has-text("Ok")');
  assert.ok(!/O que ficou mais caro/.test(await p4.innerText('#view')));
  await ctx4.close();
  console.log('ok   alerta de aumento ao salvar nota');

  // 7) captura de tela para conferir o visual
  await page.click('nav button[data-t=home]');
  await page.screenshot({ path: path.join(__dirname, 'home.png'), fullPage: true });

  assert.deepStrictEqual(errors.filter(e => !/favicon|ERR_|Failed to load resource/.test(e)), [], 'erros no console: ' + errors.join(' | '));
  console.log('ok   sem erros no console');
  await browser.close(); server.close();
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
