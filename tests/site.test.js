// Testa a página de apresentação (site/). Rodar: node tests/site.test.js
const assert = require('assert');
const fs = require('fs'), path = require('path'), http = require('http');
const { chromium } = require('playwright');
const SITE = path.join(__dirname, '..', 'site'), APP = path.join(__dirname, '..', 'app');
const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
(async () => {
  // 1) nada de terceiros: só o próprio domínio e mailto
  const urls = (html.match(/(?:src|href|content)="https?:\/\/[^"]+"/g) || []).filter(u => !/caderninhodomercado\.com\.br/.test(u));
  assert.deepStrictEqual(urls, [], 'links externos: ' + urls.join(' '));
  assert.ok(!/<script/i.test(html), 'a página não usa JavaScript');
  assert.ok(/<html lang="pt-BR"/.test(html) && /og:image/.test(html) && /rel="canonical"/.test(html));
  // 2) arquivos referenciados existem
  const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)"/g)].map(m => m[1]).filter(r => !/^(https?:|mailto:|\/$|\.\/$)/.test(r));
  for (const r of refs) { const alvo = r.startsWith('../') ? path.join(APP, r.slice(3)) : path.join(SITE, r); assert.ok(fs.existsSync(alvo), 'falta ' + r); }
  assert.ok(fs.existsSync(path.join(SITE, 'previa.png')), 'falta a imagem de prévia');
  // 3) CTA único e consistente
  const ctas = [...html.matchAll(/class="btn" href="([^"]+)">([^<]+)</g)];
  assert.ok(ctas.length === 2 && ctas.every(c => c[1] === '/' && c[2] === 'Abrir o app grátis'), JSON.stringify(ctas.map(c => c.slice(1))));
  // 4) renderização: sem estouro lateral, imagens e fontes carregam, sem pedidos externos
  const mime = { '.html': 'text/html', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.webp': 'image/webp', '.png': 'image/png' };
  const srv = http.createServer((q, r) => { let u = q.url.split('?')[0]; if (u.endsWith('/')) u += 'index.html';
    const f = u.startsWith('/conheca/') ? path.join(SITE, u.slice(9)) : path.join(APP, u);
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); });
  await new Promise(ok => srv.listen(0, ok));
  const base = 'http://localhost:' + srv.address().port + '/conheca/';
  const b = await chromium.launch();
  for (const w of [360, 390, 768, 1280]) {
    const ctx = await b.newContext({ viewport: { width: w, height: 800 } });
    const p = await ctx.newPage(); const ruins = [];
    p.on('requestfailed', r => ruins.push(r.url())); p.on('response', r => { if (r.status() >= 400) ruins.push(r.status() + ' ' + r.url()); });
    p.on('request', r => { if (!r.url().startsWith('http://localhost')) ruins.push('externo ' + r.url()); });
    await p.goto(base);
    await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)); } });
    await p.waitForTimeout(400);
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      img: [...document.images].filter(i => !i.naturalWidth).length, h1: document.querySelectorAll('h1').length,
      fontes: [...document.fonts].filter(f => f.status === 'loaded').length, alt: [...document.images].filter(i => i.getAttribute('alt') === null).length }));
    assert.strictEqual(m.sw, m.cw, 'estouro lateral em ' + w + 'px: ' + m.sw + ' > ' + m.cw);
    assert.strictEqual(m.img, 0, 'imagem quebrada em ' + w); assert.strictEqual(m.h1, 1); assert.ok(m.fontes >= 4, 'fontes: ' + m.fontes); assert.strictEqual(m.alt, 0);
    assert.deepStrictEqual(ruins, [], 'pedidos com problema em ' + w + ': ' + ruins.join(' '));
    await ctx.close();
  }
  // 5) perguntas abrem e fecham sem script
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 } }); const p = await ctx.newPage(); await p.goto(base);
  await p.click('summary:has-text("O app guarda o meu CPF?")');
  assert.ok(await p.isVisible('text=Se o seu CPF estiver na nota'));
  await b.close(); srv.close();
  console.log('ok   página de apresentação: sem terceiros, arquivos existem, sem estouro em 360/390/768/1280, imagens e fontes carregam');
})().catch(e => { console.error('FALHOU', e.message); process.exit(1); });
