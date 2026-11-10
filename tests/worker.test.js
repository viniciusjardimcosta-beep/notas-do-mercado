// Testa o proxy sem rede, com fetch simulado. Rodar: node tests/worker.test.js
const assert = require('assert');
const path = require('path');
const ORIGEM = 'https://caderninhodomercado.com.br';
let n = 0;
async function t(name, fn) { try { await fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FALHOU', name, '\n', e.message); process.exitCode = 1; } }

(async () => {
  const worker = (await import(path.join(__dirname, '..', 'worker', 'worker.js'))).default;
  const chamadas = [];
  // "Açúcar" em ISO-8859-1: 0xC7 = Ç? aqui usamos bytes latin1 reais
  const latin1 = Uint8Array.from([0x41, 0xe7, 0xfa, 0x63, 0x61, 0x72]); // "Açúcar"
  global.fetch = async (url) => { chamadas.push(String(url)); return new Response(latin1, { status: 200, headers: { 'content-type': 'text/html; charset=iso-8859-1' } }); };
  const call = (u, origin) => worker.fetch(new Request('https://proxy.exemplo.workers.dev/?u=' + encodeURIComponent(u), { headers: origin ? { Origin: origin } : {} }));

  await t('sem Origin: 403 e não busca nada', async () => {
    const r = await call('https://dfe-portal.svrs.rs.gov.br/x', null);
    assert.strictEqual(r.status, 403); assert.strictEqual(chamadas.length, 0);
  });
  await t('Origin de outro site: 403', async () => {
    assert.strictEqual((await call('https://dfe-portal.svrs.rs.gov.br/x', 'https://outro.site')).status, 403);
  });
  await t('site que não é do governo: 403', async () => {
    assert.strictEqual((await call('https://evil.com/nfce', ORIGEM)).status, 403);
    assert.strictEqual((await call('https://sefaz.rs.gov.br.evil.com/x', ORIGEM)).status, 403);
    assert.strictEqual(chamadas.length, 0);
  });
  await t('endereços de consulta de NFC-e de todas as UFs são aceitos', async () => {
    const hosts = ['www.sefaznet.ac.gov.br', 'nfce.sefaz.al.gov.br', 'www.sefaz.ap.gov.br', 'sistemas.sefaz.am.gov.br', 'nfe.sefaz.ba.gov.br', 'www.sefaz.ce.gov.br',
      'ww1.receita.fazenda.df.gov.br', 'app.sefaz.es.gov.br', 'www.nfce.go.gov.br', 'nfe.sefaz.go.gov.br', 'www.nfce.sefaz.ma.gov.br', 'www.sefaz.mt.gov.br', 'www.dfe.ms.gov.br',
      'nfce.fazenda.mg.gov.br', 'appnfc.sefa.pa.gov.br', 'www.sefaz.pb.gov.br', 'sped.fazenda.pr.gov.br', 'nfce.sefaz.pe.gov.br', 'www.sefaz.pi.gov.br', 'www.nfce.fazenda.rj.gov.br',
      'nfce.set.rn.gov.br', 'nfce.sefaz.rn.gov.br', 'www.sefaz.rs.gov.br', 'www.nfce.sefin.ro.gov.br', 'portalapp.sefaz.rr.gov.br', 'sat.sef.sc.gov.br',
      'www.nfce.fazenda.sp.gov.br', 'www.nfce.se.gov.br', 'www.sefaz.to.gov.br'];
    for (const hst of hosts) assert.notStrictEqual((await call('https://' + hst + '/x?p=1', ORIGEM)).status, 403, hst);
  });
  await t('hosts parecidos mas que não são de fazenda: 403', async () => {
    for (const hst of ['reset.sp.gov.br', 'www.saude.pa.gov.br', 'sefa.pa.gov.br.evil.com', 'set.evil.com']) assert.strictEqual((await call('https://' + hst + '/x', ORIGEM)).status, 403, hst);
  });
  await t('limite por IP: 429 depois de 60 consultas no minuto, outro IP segue livre', async () => {
    const mk = ip => new Request('https://w.test/?u=' + encodeURIComponent('https://www.sefaz.rs.gov.br/x'), { headers: { Origin: ORIGEM, 'CF-Connecting-IP': ip } });
    const w = (await import(require('path').resolve(__dirname, '../worker/worker.js'))).default;
    let ultimo;
    for (let i = 0; i < 61; i++) ultimo = await w.fetch(mk('9.9.9.9'), {});
    assert.strictEqual(ultimo.status, 429);
    assert.strictEqual(ultimo.headers.get('Retry-After'), '60');
    assert.strictEqual(ultimo.headers.get('Access-Control-Allow-Origin'), ORIGEM);
    assert.notStrictEqual((await w.fetch(mk('8.8.8.8'), {})).status, 429);
  });
  await t('limite por binding LIMITER quando existir', async () => {
    const w = (await import(require('path').resolve(__dirname, '../worker/worker.js'))).default;
    const r = await w.fetch(new Request('https://w.test/?u=' + encodeURIComponent('https://www.sefaz.rs.gov.br/x'), { headers: { Origin: ORIGEM, 'CF-Connecting-IP': '7.7.7.7' } }), { LIMITER: { limit: async () => ({ success: false }) } });
    assert.strictEqual(r.status, 429);
  });
  await t('gov.br sem relação com fazenda: 403', async () => {
    assert.strictEqual((await call('https://www.saude.gov.br/x', ORIGEM)).status, 403);
  });
  for (const u of ['https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=1', 'https://dfe-portal.svrs.rs.gov.br/Dfe/QrCodeNFce?p=1',
    'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica?p=1', 'https://www.fazenda.pr.gov.br/nfce/qrcode?p=1', 'https://sat.sef.sc.gov.br/nfce/consulta?p=1']) {
    await t('permite ' + new URL(u).hostname, async () => { assert.strictEqual((await call(u, ORIGEM)).status, 200); });
  }
  await t('decodifica latin1 e devolve UTF-8 com CORS só para o seu site', async () => {
    const r = await call('https://www.sefaz.rs.gov.br/x', ORIGEM);
    assert.strictEqual(await r.text(), 'Açúcar');
    assert.strictEqual(r.headers.get('access-control-allow-origin'), ORIGEM);
    assert.strictEqual(r.headers.get('cache-control'), 'no-store');
  });
  for (const o of ['https://caderninhodomercado.com.br', 'https://www.caderninhodomercado.com.br']) {
    await t('aceita o endereço novo ' + o + ' e devolve CORS para ele', async () => {
      const r = await call('https://www.sefaz.rs.gov.br/x', o);
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.headers.get('access-control-allow-origin'), o);
    });
  }
  await t('endereço parecido com o novo é recusado', async () => {
    assert.strictEqual((await call('https://www.sefaz.rs.gov.br/x', 'https://caderninhodomercado.com.br.evil.com')).status, 403);
    assert.strictEqual((await call('https://www.sefaz.rs.gov.br/x', 'http://caderninhodomercado.com.br')).status, 403);
  });
  await t('endereço inválido ou ausente: 400', async () => {
    assert.strictEqual((await worker.fetch(new Request('https://p.workers.dev/', { headers: { Origin: ORIGEM } }))).status, 400);
    assert.strictEqual((await call('isso nao e url', ORIGEM)).status, 400);
  });
  await t('protocolo estranho: 400', async () => {
    assert.strictEqual((await call('file:///etc/passwd', ORIGEM)).status, 400);
  });
  await t('contagem anônima: só UF e resultado, sem chave nem endereço; sem binding funciona; binding quebrado não derruba', async () => {
    const chave = '43261101234567000190650010000001231000000120'.slice(0, 44);
    const url = 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=' + chave + '|2|1|1|ABC';
    const pontos = [];
    const env = { METRICAS: { writeDataPoint: d => pontos.push(d) } };
    const ch = u => worker.fetch(new Request('https://w.test/?u=' + encodeURIComponent(u), { headers: { Origin: ORIGEM, 'CF-Connecting-IP': 'ip-metrica-' + Math.random() } }), env);
    assert.strictEqual((await ch(url)).status, 200);
    assert.deepStrictEqual(pontos[0], { blobs: ['RS', 'ok'], doubles: [1], indexes: ['RS'] });
    assert.ok(!JSON.stringify(pontos).includes(chave) && !JSON.stringify(pontos).includes('sefaz'), 'nada além de UF e resultado');
    await ch('https://www.sefaz.sp.gov.br/x'); assert.strictEqual(pontos[1].blobs[0], 'outra', 'sem chave: "outra"');
    await ch('https://www.sefaz.sp.gov.br/?p=' + '35' + chave.slice(2)); assert.strictEqual(pontos[2].blobs[0], 'SP');
    assert.strictEqual((await worker.fetch(new Request('https://w.test/?u=' + encodeURIComponent(url), { headers: { Origin: ORIGEM, 'CF-Connecting-IP': 'x1' } }), {})).status, 200, 'sem binding');
    const quebrado = { METRICAS: { writeDataPoint() { throw new Error('falhou'); } } };
    assert.strictEqual((await worker.fetch(new Request('https://w.test/?u=' + encodeURIComponent(url), { headers: { Origin: ORIGEM, 'CF-Connecting-IP': 'x2' } }), quebrado)).status, 200, 'binding quebrado');
  });
  console.log('\n' + n + ' testes do proxy passaram' + (process.exitCode ? ' (com falhas)' : ''));
})();
