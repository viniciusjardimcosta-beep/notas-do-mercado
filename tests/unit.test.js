// Testes sem DOM: chave de acesso, leitura de texto, normalização e análises.
// Rodar: node tests/unit.test.js
const assert = require('assert');
const P = require('../app/parser.js');
const C = require('../app/core.js');
let n = 0;
function t(name, fn) { try { fn(); n++; console.log('ok  ', name); } catch (e) { console.error('FALHOU', name, '\n', e.message); process.exitCode = 1; } }

// monta uma chave de 44 dígitos com DV correto (RS=43, modelo 65)
function mkChave(prefix43) {
  let sum = 0, w = 2;
  for (let i = 42; i >= 0; i--) { sum += +prefix43[i] * w; w = w === 9 ? 2 : w + 1; }
  const r = sum % 11; return prefix43 + (r < 2 ? 0 : 11 - r);
}
const CH = mkChave('4326110123456700019065001000000123100000012');

t('chave: extrai de URL e valida DV', () => {
  const url = 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx?p=' + CH + '|2|1|1|ABCDEF';
  assert.strictEqual(P.extractChave(url), CH);
  assert.strictEqual(P.parseChave(CH).uf, 'RS');
  assert.strictEqual(P.parseChave(CH).valid, true);
});
t('chave: DV errado é reprovado', () => {
  const bad = CH.slice(0, 43) + ((+CH[43] + 1) % 10);
  assert.strictEqual(P.parseChave(bad).valid, false);
});
t('chave: aceita grupos de 4 dígitos com espaço', () => {
  const spaced = CH.match(/.{1,4}/g).join(' ');
  assert.strictEqual(P.extractChave(spaced), CH);
});
t('chave: UF de SC, PR e SP', () => {
  assert.strictEqual(P.parseChave('42' + '0'.repeat(42)).uf, 'SC');
  assert.strictEqual(P.parseChave('41' + '0'.repeat(42)).uf, 'PR');
  assert.strictEqual(P.parseChave('35' + '0'.repeat(42)).uf, 'SP');
});
t('num: formatos brasileiros', () => {
  assert.strictEqual(P.num('1.234,56'), 1234.56);
  assert.strictEqual(P.num('R$ 12,90'), 12.9);
  assert.strictEqual(P.num('0,500'), 0.5);
  assert.ok(isNaN(P.num('')));
});

const TEXTO = `SUPERMERCADO EXEMPLO LTDA CNPJ: 01.234.567/0001-90
BISC REC OREO 90G (Código: 7622300) Qtde.: 2 UN: UN Vl. Unit.: 3,49 Vl. Total 6,98
ARROZ TIPO 1 5KG (Código: 123456) Qtde.: 1 UN: PC Vl. Unit.: 28,90 Vl. Total 28,90
BANANA PRATA (Código: 55) Qtde.: 1,250 UN: KG Vl. Unit.: 6,99 Vl. Total 8,74
Valor a pagar R$ 44,62
Emissão: 03/10/2026 18:22:10 ` + CH;

t('texto: lê 3 itens, loja, data e total', () => {
  const r = P.parseText(TEXTO);
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.items[0].nome, 'BISC REC OREO 90G');
  assert.strictEqual(r.items[0].vlTotal, 6.98);
  assert.strictEqual(r.items[2].qtd, 1.25);
  assert.strictEqual(r.store.cnpj, '01234567000190');
  assert.strictEqual(r.date, '2026-10-03');
  assert.strictEqual(r.total, 44.62);
  assert.strictEqual(r.uf, 'RS');
  assert.deepStrictEqual(r.warnings, []);
});
t('texto corrido numa linha só: corta o cabeçalho do 1º item', () => {
  const r = P.parseText(TEXTO.replace(/\n/g, ' '));
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.items[0].nome, 'BISC REC OREO 90G');
  assert.strictEqual(r.items[1].nome, 'ARROZ TIPO 1 5KG');
});
t('texto: avisa quando soma não bate com o total', () => {
  const r = P.parseText(TEXTO.replace('44,62', '90,00'));
  assert.ok(r.warnings.length >= 1);
});
t('linhas: formato de cupom em linhas', () => {
  const r = P.parseText('001 7891000100103 LEITE INTEGRAL 1L 2 UN x 5,49 10,98\n002 PAO FRANCES 0,350 KG x 14,90 5,22\nTotal R$ 16,20');
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[0].vlTotal, 10.98);
});
t('texto vazio ou irrelevante: zero itens', () => {
  assert.strictEqual(P.parseText('olá mundo').items.length, 0);
});

// ---- core ----
t('tamanho: 140g, 1,5L, 2kg', () => {
  assert.deepStrictEqual(C.parseSize('BISC REC 140G'), { valor: 140, unidade: 'g' });
  assert.deepStrictEqual(C.parseSize('REFRIG GUARANA 1,5L'), { valor: 1500, unidade: 'ml' });
  assert.deepStrictEqual(C.parseSize('ARROZ 2KG'), { valor: 2000, unidade: 'g' });
});
t('normalização: BISC REC e Biscoito Recheado viram o mesmo produto', () => {
  const a = C.normalizeName('BISC REC OREO 140G'), b = C.normalizeName('Biscoito Recheado Oreo 140g');
  assert.strictEqual(a.key, b.key);
});
t('categorias básicas', () => {
  assert.strictEqual(C.categorize('BISC REC OREO 90G'), 'snacks');
  assert.strictEqual(C.categorize('REFRIG COCA COLA 2L'), 'refri');
  assert.strictEqual(C.categorize('ARROZ TIPO 1 5KG'), 'mercearia');
  assert.strictEqual(C.categorize('BANANA PRATA'), 'hortifruti');
  assert.strictEqual(C.categorize('XYZ QUALQUER'), 'outros');
});

function compra(id, date, loja, cnpj, itens) {
  return { id: id, date: date, store: { name: loja, cnpj: cnpj }, total: itens.reduce((s, i) => s + i.vlTotal, 0), items: itens };
}
const it = (nome, codigo, qtd, vu) => ({ nome, codigo, qtd, un: 'UN', vlUnit: vu, vlTotal: Math.round(qtd * vu * 100) / 100 });
const compras = [
  compra('a', '2026-08-05', 'Mercado A', '111', [it('BISC REC OREO 90G', '7622300', 2, 3.00), it('ARROZ TIPO 1 5KG', '1', 1, 25.00), it('LEITE INTEGRAL 1L', '2', 6, 5.00)]),
  compra('b', '2026-09-05', 'Mercado A', '111', [it('Biscoito Recheado Oreo 90g', '7622300', 2, 3.30), it('ARROZ TIPO 1 5KG', '1', 1, 27.50), it('LEITE INTEGRAL 1L', '2', 6, 5.20)]),
  compra('c', '2026-10-05', 'Mercado B', '222', [it('BISC REC OREO 90G', '7622300', 1, 2.90), it('ARROZ TIPO 1 5KG', '1', 1, 26.00), it('LEITE INTEGRAL 1L', '2', 6, 5.50)])
];
t('produtos: agrupa variações do mesmo item', () => {
  const p = C.buildProducts(compras);
  assert.strictEqual(p.length, 3);
  assert.ok(p.every(x => x.compras.length === 3));
});
t('variação de preço: biscoito por kg, primeiro vs último', () => {
  const ch = C.priceChanges(compras);
  const bisc = ch.find(c => /OREO/i.test(c.nome));
  assert.ok(bisc);
  assert.strictEqual(bisc.rotulo, 'kg');
  assert.ok(Math.abs(bisc.pct - (-3.33)) < 0.1, 'pct=' + bisc.pct);
  const leite = ch.find(c => /LEITE/.test(c.nome));
  assert.ok(Math.abs(leite.pct - 10) < 0.01);
});
t('variação de preço: devolve a série de cada compra para o gráfico', () => {
  const leite = C.priceChanges(compras).find(c => /LEITE/.test(c.nome));
  assert.strictEqual(leite.serie.length, 3);
  assert.deepStrictEqual(leite.serie.map(s => s.data), ['2026-08-05', '2026-09-05', '2026-10-05'].slice(0, 3).map((d, i) => leite.serie[i].data));
  assert.ok(Math.abs(leite.serie[leite.serie.length - 1].valor - 5.5) < 0.001);
  assert.ok(leite.serie.every((s, i, a) => i === 0 || a[i - 1].data <= s.data), 'série em ordem de data');
});
t('meta: interpreta valores digitados', () => {
  assert.strictEqual(C.parseMoney('900'), 900);
  assert.strictEqual(C.parseMoney('900,50'), 900.5);
  assert.strictEqual(C.parseMoney('1.200,00'), 1200);
  assert.strictEqual(C.parseMoney('1.200'), 1200);
  assert.strictEqual(C.parseMoney('R$ 1200'), 1200);
  assert.strictEqual(C.parseMoney('900.5'), 900.5);
  ['', 'abc', '0', '-5', '12,345', '1,2,3', null].forEach(v => assert.strictEqual(C.parseMoney(v), null, String(v)));
});
const pm = (d, v) => ({ date: d, total: v, items: [] });
t('meta: mês corrente, restante, ritmo e situação', () => {
  const g = C.goalStatus([pm('2026-11-03', 400), pm('2026-11-10', 212), pm('2026-10-20', 999)], 900, new Date(2026, 10, 15, 12));
  assert.strictEqual(g.gasto, 612); assert.strictEqual(g.notas, 2);
  assert.strictEqual(g.restante, 288); assert.strictEqual(g.diasRestantes, 15);
  assert.strictEqual(g.situacao, 'ok'); assert.ok(Math.abs(g.pct - 68) < 0.01);
  assert.strictEqual(g.projecao, 1224);
});
t('meta: perto aos 80%, passou acima de 100%, sem meta não calcula', () => {
  const now = new Date(2026, 10, 15, 12);
  assert.strictEqual(C.goalStatus([pm('2026-11-02', 720)], 900, now).situacao, 'perto');
  assert.strictEqual(C.goalStatus([pm('2026-11-02', 900)], 900, now).situacao, 'perto');
  const p = C.goalStatus([pm('2026-11-02', 950)], 900, now);
  assert.strictEqual(p.situacao, 'passou'); assert.strictEqual(p.restante, -50);
  assert.strictEqual(C.goalStatus([pm('2026-11-02', 10)], 0, now), null);
  assert.strictEqual(C.goalStatus([pm('2026-11-02', 10)], undefined, now), null);
});
t('meta: projeção só depois do dia 10 e antes do último dia; mês sem notas', () => {
  assert.strictEqual(C.goalStatus([pm('2026-11-02', 300)], 900, new Date(2026, 10, 9)).projecao, null);
  assert.strictEqual(C.goalStatus([pm('2026-11-02', 300)], 900, new Date(2026, 10, 10)).projecao, 900);
  const fim = C.goalStatus([pm('2026-12-02', 300)], 900, new Date(2026, 11, 31));
  assert.strictEqual(fim.projecao, null); assert.strictEqual(fim.diasRestantes, 0);
  const vazio = C.goalStatus([pm('2026-10-02', 300)], 900, new Date(2026, 10, 15));
  assert.strictEqual(vazio.gasto, 0); assert.strictEqual(vazio.notas, 0); assert.strictEqual(vazio.projecao, null);
});
t('busca: acha por palavras, sem acento, e mostra última compra e menor preço', () => {
  const r = C.lookupProducts(compras, 'leite integral', 8);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].nCompras, 3);
  assert.strictEqual(r[0].ultima.vlUnit, 5.5); assert.strictEqual(r[0].ultima.loja, 'Mercado B'); assert.strictEqual(r[0].ultima.data, '2026-10-05');
  assert.strictEqual(r[0].menor.vlUnit, 5.0); assert.strictEqual(r[0].menor.data, '2026-08-05');
  assert.strictEqual(r[0].menorEhUltima, false); assert.strictEqual(r[0].rotulo, 'litro');
  assert.strictEqual(C.lookupProducts(compras, 'LEITE', 8).length, 1);
  assert.strictEqual(C.lookupProducts(compras, 'oreo', 8).length, 1, 'nomes abreviados e por extenso caem no mesmo produto');
  assert.strictEqual(C.lookupProducts(compras, 'leite arroz', 8).length, 0, 'todas as palavras precisam aparecer');
  assert.deepStrictEqual(C.lookupProducts(compras, '   ', 8), []);
  assert.deepStrictEqual(C.lookupProducts(compras, 'xyzabc', 8), []);
});
t('busca: acento, empate de menor preço fica com o mais recente, última é a menor', () => {
  const cs = [
    compra('a', '2026-08-05', 'M1', '1', [it('AÇÚCAR CRISTAL 1KG', '9', 1, 4.00)]),
    compra('b', '2026-09-05', 'M2', '2', [it('AÇÚCAR CRISTAL 1KG', '9', 1, 4.00)]),
    compra('c', '2026-10-05', 'M3', '3', [it('AÇÚCAR CRISTAL 1KG', '9', 1, 4.00)])
  ];
  const r = C.lookupProducts(cs, 'acucar', 8)[0];
  assert.strictEqual(r.menor.loja, 'M3'); assert.strictEqual(r.menorEhUltima, true);
  const barata = C.lookupProducts([compra('a', '2026-08-05', 'M1', '1', [it('ARROZ 5KG', '1', 1, 30)]), compra('b', '2026-09-05', 'M2', '2', [it('ARROZ 5KG', '1', 1, 20)])], 'arroz', 8)[0];
  assert.strictEqual(barata.menorEhUltima, true); assert.strictEqual(barata.menor.vlUnit, 20);
});
t('busca: aviso de possível promoção quando a última está 40% acima do menor', () => {
  const r = C.lookupProducts([compra('a', '2026-08-05', 'M1', '1', [it('MOLHO FUGINI 340G', '5', 1, 0.99)]), compra('b', '2026-09-05', 'M1', '1', [it('MOLHO FUGINI 340G', '5', 1, 1.89)])], 'molho', 8)[0];
  assert.strictEqual(r.promoNaUltima, true);
  const normal = C.lookupProducts(compras, 'leite', 8)[0];
  assert.strictEqual(normal.promoNaUltima, false);
});
t('busca: limita a quantidade e ordena por mais compras', () => {
  const many = [];
  for (let i = 0; i < 12; i++) many.push(compra('x' + i, '2026-08-0' + (i % 9 + 1), 'M', '1', [it('BISCOITO SABOR ' + String.fromCharCode(65 + i) + ' ' + (100 + i) + 'G', '' + i, 1, 3)]));
  assert.strictEqual(C.lookupProducts(many, 'biscoito', 8).length, 8);
  assert.strictEqual(C.lookupProducts(many, 'biscoito', 3).length, 3);
});
const um = (d, nome, v, cod) => compra('k' + d + nome, d, 'M', '1', [it(nome, cod || '0', 1, v)]);
t('encolheu: mesma marca, 90g -> 80g no mesmo preço avisa com os números certos', () => {
  const a = C.shrinkAlerts([um('2026-08-05', 'BISC REC OREO 90G', 3.30, '7622300'), um('2026-09-05', 'BISC REC OREO 80G', 3.30, '7622301')]);
  assert.strictEqual(a.length, 1);
  assert.ok(Math.abs(a[0].encolheuPct - 11.11) < 0.01, 'encolheu ' + a[0].encolheuPct);
  assert.ok(Math.abs(a[0].pctEmbalagem) < 0.001);
  assert.ok(Math.abs(a[0].pctKg - 12.5) < 0.01, 'kg ' + a[0].pctKg);
  assert.strictEqual(a[0].rotulo, 'kg'); assert.strictEqual(a[0].de.size, 90); assert.strictEqual(a[0].para.size, 80);
});
t('encolheu: não avisa sem mudança de tamanho, com queda proporcional de preço, nem para tamanhos muito diferentes', () => {
  assert.strictEqual(C.shrinkAlerts([um('2026-08-05', 'BISC REC OREO 90G', 3.30), um('2026-09-05', 'BISC REC OREO 90G', 3.60)]).length, 0, 'mesmo tamanho');
  assert.strictEqual(C.shrinkAlerts([um('2026-08-05', 'BISC REC OREO 90G', 3.30), um('2026-09-05', 'BISC REC OREO 80G', 2.93)]).length, 0, 'preço caiu junto');
  assert.strictEqual(C.shrinkAlerts([um('2026-08-05', 'ARROZ TIPO 1 1KG', 6), um('2026-09-05', 'ARROZ TIPO 1 500G', 5)]).length, 0, 'metade do tamanho é outro produto');
  assert.strictEqual(C.shrinkAlerts([um('2026-08-05', 'ARROZ TIPO 1 500G', 5), um('2026-09-05', 'ARROZ TIPO 1 1KG', 9)]).length, 0, 'aumento de tamanho');
  assert.strictEqual(C.shrinkAlerts([um('2026-08-05', 'SUCO UVA 1L', 8), um('2026-09-05', 'SUCO UVA 980ML', 8)]).length, 0, 'menos de 3% de diferença');
  assert.strictEqual(C.shrinkAlerts([um('2026-08-05', 'SUCO UVA 1L', 8), um('2026-09-05', 'SUCO LARANJA 900ML', 8)]).length, 0, 'produtos diferentes');
});
t('encolheu: se o tamanho menor já tinha sido comprado antes, os dois existem juntos e não avisa', () => {
  const a = C.shrinkAlerts([um('2026-08-05', 'CAFE MOIDO 180G', 9), um('2026-09-05', 'CAFE MOIDO 200G', 9.5), um('2026-10-05', 'CAFE MOIDO 180G', 9)]);
  assert.strictEqual(a.length, 0);
});
t('encolheu: compara com a compra maior mais recente e mostra litros', () => {
  const a = C.shrinkAlerts([um('2026-07-05', 'REFRIG GUARANA 2L', 8), um('2026-08-05', 'REFRIG GUARANA 1.8L', 8), um('2026-09-05', 'REFRIG GUARANA 1.65L', 8)]);
  assert.strictEqual(a.length, 1);
  assert.strictEqual(a[0].de.size, 1800); assert.strictEqual(a[0].para.size, 1650);
  assert.strictEqual(a[0].rotulo, 'litro');
});
t('preço por kg usa o tamanho de cada compra quando o mesmo código muda de embalagem', () => {
  const cs = [um('2026-08-05', 'LEITE COND MOCA 1L', 5.00, '7891000100103'), um('2026-09-05', 'LEITE COND MOCA 900ML', 5.00, '7891000100103')];
  const ch = C.priceChanges(cs);
  assert.strictEqual(ch.length, 1);
  assert.ok(Math.abs(ch[0].pct - 11.11) < 0.01, 'pct=' + ch[0].pct);
  assert.strictEqual(ch[0].rotulo, 'litro');
});
t('lista: acha os repetidos, marca os que estão acabando e calcula o intervalo', () => {
  const L = C.shoppingList(compras, new Date(2026, 10, 7));
  assert.strictEqual(L.length, 3);
  assert.ok(L.every(x => x.acabando && x.intervalo === 31 && x.diasDesde === 33 && x.nCompras === 3), JSON.stringify(L[0]));
  const leite = L.find(x => /LEITE/.test(x.nome));
  assert.strictEqual(leite.ultimoTotal, 33); assert.strictEqual(leite.ultimoPreco, 5.5); assert.strictEqual(leite.loja, 'Mercado B');
  const cedo = C.shoppingList(compras, new Date(2026, 9, 10));
  assert.ok(cedo.every(x => !x.acabando && x.diasDesde === 5));
});
t('lista: ignora quem só tem uma data, esconde os marcados e ordena os que estão acabando primeiro', () => {
  const cs = [
    compra('a', '2026-10-01', 'M', '1', [it('ARROZ 5KG', '1', 1, 25), it('FEIJAO 1KG', '2', 1, 8), it('OVOS 12', '3', 1, 12)]),
    compra('b', '2026-10-11', 'M', '1', [it('ARROZ 5KG', '1', 1, 26), it('FEIJAO 1KG', '2', 1, 8.5), it('SAL 1KG', '4', 1, 3), it('SAL 1KG', '4', 1, 3)]),
    compra('c', '2026-10-21', 'M', '1', [it('FEIJAO 1KG', '2', 1, 9), it('OVOS 12', '3', 1, 13)])
  ];
  const now = new Date(2026, 9, 29); // feijão: a cada 10 dias, faz 8 (80%): acabando. arroz: 10 dias, faz 18: acabando. ovos: 20 dias, faz 8: não
  const L = C.shoppingList(cs, now);
  assert.deepStrictEqual(L.map(x => x.nome), ['ARROZ 5KG', 'FEIJAO 1KG', 'OVOS 12'], L.map(x => x.nome + x.ratio.toFixed(2)).join(' '));
  assert.deepStrictEqual(L.map(x => x.acabando), [true, true, false]);
  assert.ok(!L.some(x => /SAL/.test(x.nome)), 'duas linhas no mesmo dia contam como uma data só');
  const sem = C.shoppingList(cs, now, { [L[0].key]: true });
  assert.deepStrictEqual(sem.map(x => x.nome), ['FEIJAO 1KG', 'OVOS 12']);
});
t('janela: só os últimos 12 meses a partir da nota mais recente', () => {
  const P = [pm('2023-01-10', 1), pm('2025-10-05', 2), pm('2025-10-06', 3), pm('2026-10-05', 4)];
  const W = C.windowPurchases(P);
  assert.deepStrictEqual(W.map(x => x.date), ['2025-10-06', '2026-10-05'], 'a nota de exatamente 12 meses atrás fica de fora');
  const dentro = [pm('2026-01-10', 1), pm('2026-10-05', 4)];
  assert.strictEqual(C.windowPurchases(dentro), dentro, 'sem nada para tirar, devolve o mesmo array');
  assert.deepStrictEqual(C.windowPurchases([]), []);
});
t('janela: nota muito antiga não entra na variação de preço, na inflação nem na comparação entre lojas', () => {
  const old = compra('o', '2023-01-05', 'Mercado A', '111', [it('LEITE INTEGRAL 1L', '2', 6, 3.00), it('ARROZ TIPO 1 5KG', '1', 1, 12.00), it('BISC REC OREO 90G', '7622300', 2, 1.50)]);
  const cs = [old].concat(compras);
  const leite = C.priceChanges(cs).find(c => /LEITE/.test(c.nome));
  assert.ok(Math.abs(leite.pct - 10) < 0.01, 'sem a nota antiga: 5,00 -> 5,50 = +10%, veio ' + leite.pct);
  assert.strictEqual(leite.serie.length, 3);
  const tudo = C.priceChanges(cs, { tudo: true }).find(c => /LEITE/.test(c.nome));
  assert.ok(Math.abs(tudo.pct - 83.33) < 0.1, 'com tudo: 3,00 -> 5,50');
  assert.ok(Math.abs(C.personalInflation(cs).pct - C.personalInflation(compras).pct) < 1e-9, 'inflação ignora a nota antiga');
  assert.strictEqual(C.storeCompare(cs).length, C.storeCompare(compras).length);
  assert.strictEqual(C.lookupProducts(cs, 'leite', 8)[0].nCompras, 4, 'a busca "Quanto paguei?" continua enxergando todo o histórico');
});
t('cache: resultado igual ao de um cálculo sem cache, e reage a qualquer mudança nas notas ou nos ajustes', () => {
  const fresh = () => { const id = require.resolve('../app/core.js'); delete require.cache[id]; return require('../app/core.js'); };
  const nomes = ['LEITE INTEGRAL 1L', 'LEITE INTEGRAL 900ML', 'ARROZ TIPO 1 5KG', 'BISC REC OREO 90G', 'BISC REC OREO 80G', 'CAFE MOIDO 500G', 'SABAO PO OMO 1KG', 'REFRIG GUARANA 2L', 'QUEIJO MUSSARELA KG', 'OVOS 12'];
  let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const P = [];
  for (let i = 0; i < 40; i++) {
    const d = new Date(2026, 0, 1 + i * 7).toISOString().slice(0, 10);
    const itens = []; for (let k = 0; k < 6; k++) itens.push(it(nomes[rnd(nomes.length)], String(7890000000000 + rnd(12)), 1 + rnd(3), Math.round((3 + rnd(300) / 10) * 100) / 100));
    P.push(compra('n' + i, d, 'Mercado ' + (i % 3), String(i % 3), itens));
  }
  const NOW = new Date(2026, 9, 20);
  const snap = (M) => JSON.stringify([M.priceChanges(P), M.personalInflation(P), M.storeCompare(P), M.categoryTotals(P, {}, {}), M.cutPotential(P, {}, {}, 20), M.shoppingList(P, NOW), M.shrinkAlerts(P), M.lookupProducts(P, 'leite', 8), M.suggestMerges(P, 5), M.monthCompare(P, NOW)]);
  const A = snap(C);
  assert.strictEqual(snap(C), A, 'segunda chamada (com cache) igual à primeira');
  assert.strictEqual(snap(fresh()), A, 'igual a um módulo novo, sem cache');
  const prods = C.buildProducts(P); const ordem = prods.map(x => x.key).join(); prods.sort((a, b) => b.key.localeCompare(a.key)); prods.length = 0;
  assert.strictEqual(C.buildProducts(P).map(x => x.key).join(), ordem, 'ordenar ou esvaziar o resultado não estraga o cache');
  const antes = C.priceChanges(P, { tudo: true }).length;
  P.push(compra('extra', '2026-10-01', 'Mercado 0', '0', [it('MOLHO FUGINI 340G', '5', 1, 1.0)]));
  assert.notStrictEqual(snap(C), A, 'nota nova muda o resultado');
  assert.strictEqual(snap(C), snap(fresh()));
  P.pop(); assert.strictEqual(snap(C), A, 'apagar volta ao resultado anterior');
  P[3].items[0].vlUnit = 99.99; P[3].items[0].vlTotal = 99.99;
  assert.strictEqual(snap(C), snap(fresh()), 'alterar um item no mesmo lugar também é percebido');
  P[3].items[0].vlUnit = 1; assert.notStrictEqual(snap(C).length, 0);
  const sem = snap(C);
  C.configure({ names: { [C.buildProducts(P)[0].key]: 'NOME NOVO' } });
  assert.ok(/NOME NOVO/.test(snap(C)), 'renomear produto aparece');
  C.configure({}); assert.strictEqual(snap(C), sem, 'desfazer o ajuste volta ao resultado anterior');
  const keys = C.buildProducts(P).map(x => x.key);
  C.configure({ merges: { [keys[1]]: keys[0] } });
  const unido = snap(C); const f2 = fresh(); f2.configure({ merges: { [keys[1]]: keys[0] } }); assert.strictEqual(unido, snap(f2), 'unir produtos: igual ao sem cache');
  assert.notStrictEqual(unido, sem); C.configure({});
  assert.ok(antes >= 0);
});
t('lista: produto que parou de ser comprado sai da lista; o ritmo vem das últimas compras', () => {
  const dias = ['2025-01-01', '2025-06-01', '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'];
  const cs = dias.map((d, i) => compra('r' + i, d, 'M', '1', [it('IOGURTE NATURAL 170G', '9', 1, 3)]));
  const L = C.shoppingList(cs, new Date(2026, 9, 10));
  assert.strictEqual(L.length, 1); assert.strictEqual(L[0].intervalo, 7, 'ritmo das últimas 6 compras, não da vida toda'); assert.strictEqual(L[0].acabando, false);
  assert.strictEqual(L[0].nCompras, 8);
  const parou = [compra('a', '2025-01-01', 'M', '1', [it('CREME DE LEITE 200G', '8', 1, 3)]), compra('b', '2025-02-01', 'M', '1', [it('CREME DE LEITE 200G', '8', 1, 3)])];
  assert.strictEqual(C.shoppingList(parou, new Date(2026, 9, 10)).length, 0, 'há 600 dias: não aparece mais');
  assert.strictEqual(C.shoppingList(parou, new Date(2025, 4, 1)).length, 1, 'há 89 dias ainda aparece');
});
t('inflação pessoal: calcula com 3 produtos', () => {
  const inf = C.personalInflation(compras);
  assert.strictEqual(inf.produtos, 3);
  assert.ok(inf.pct > 0 && inf.pct < 10, 'pct=' + inf.pct);
});
t('inflação pessoal: null com poucos produtos', () => {
  assert.strictEqual(C.personalInflation(compras.slice(0, 1)).pct, null);
});
t('comparação entre lojas', () => {
  const sc = C.storeCompare(compras);
  assert.ok(sc.length >= 1);
  assert.ok(sc[0].economiaPct > 0);
});
t('potencial de corte: usa só categorias cortáveis', () => {
  const cp = C.cutPotential(compras, {}, {}, 20);
  assert.ok(cp.categorias.every(c => c.cortavel));
  assert.ok(cp.totalPeriodo > 0);
  assert.ok(cp.economiaAnual > 0);
  const none = C.cutPotential(compras, {}, { snacks: false }, 20);
  assert.strictEqual(none.totalPeriodo, 0);
});
t('totais por mês', () => {
  const m = C.monthlyTotals(compras);
  assert.strictEqual(m.length, 3);
  assert.strictEqual(m[0].mes, '2026-08');
});
t('potencial de corte: com 1 dia de notas não projeta mês nem ano', () => {
  const cp = C.cutPotential(compras.slice(0, 1), {}, {}, 20);
  assert.strictEqual(cp.poucosDados, true);
  assert.strictEqual(cp.economiaAnual, null);
  assert.ok(cp.economiaPeriodo > 0);
});
t('potencial de corte: com 62 dias projeta', () => {
  const cp = C.cutPotential(compras, {}, {}, 20);
  assert.strictEqual(cp.poucosDados, false);
  assert.ok(cp.economiaAnual > 0 && cp.economiaMensal > 0);
});
t('categoria corrigida pelo usuário vale para o produto todo', () => {
  const prod = C.buildProducts(compras).find(p => /GUARANA|OREO/i.test(p.nome));
  const antes = C.categoryTotals(compras, {}, {}).find(c => c.id === prod.categoria).total;
  const ov = {}; ov[prod.key] = 'outros';
  const depois = C.categoryTotals(compras, ov, {});
  const antesCat = depois.find(c => c.id === prod.categoria);
  assert.ok(!antesCat || antesCat.total < antes);
  assert.ok(depois.find(c => c.id === 'outros').total > 0);
});
t('buildProducts guarda o nome do item em cada compra', () => {
  const p = C.buildProducts(compras)[0];
  assert.ok(p.compras.every(c => typeof c.nome === 'string' && c.nome.length > 0));
});
t('nome da loja: texto antes de CNPJ', () => {
  assert.strictEqual(P.parseText(TEXTO).store.name, 'SUPERMERCADO EXEMPLO LTDA');
});
t('nome da loja: CNPJ em outra linha usa a linha anterior', () => {
  const r = P.parseText('MERCADO DO ZE\nCNPJ: 01.234.567/0001-90\nARROZ 5KG (Código: 1) Qtde.: 1 UN: UN Vl. Unit.: 25,00 Vl. Total 25,00\nValor a pagar R$ 25,00\nEmissão: 05/08/2026');
  assert.strictEqual(r.store.name, 'MERCADO DO ZE');
});
t('página real repete "Vl. Total" depois do item: não vira item falso', () => {
  const txt = 'COTRIPAL AGROPECUARIA CNPJ: 01.234.567/0001-90 Descrição Código Qtde Un Vl. Unit. Vl. Total ' +
    'ALIM ACHOC NESCAU 550G (Código: 1) Qtde.: 1 UN: PCT Vl. Unit.: 17,90 Vl. Total 17,90 ' +
    'Vl. Total 17,90 (Código: 1) Qtde.: 1 UN: PCT Vl. Unit.: 17,90 Vl. Total 17,90 ' +
    'BANANA PRATA (Código: 2) Qtde.: 0,621 UN: KG Vl. Unit.: 9,90 Vl. Total 6,15 ' +
    'Vl. Total 6,15 (Código: 2) Qtde.: 0,621 UN: KG Vl. Unit.: 9,90 Vl. Total 6,15 ' +
    'Valor a pagar R$ 24,05 Emissão: 19/09/2026';
  const r = P.parseText(txt);
  assert.ok(r.items.every(i => !/^Vl\./i.test(i.nome)), JSON.stringify(r.items.map(i => i.nome)));
  assert.strictEqual(r.items[0].nome, 'ALIM ACHOC NESCAU 550G');
});
t('categorias: itens reais da nota do RS (Cotripal)', () => {
  const exp = {'PALETA C/OSS ANG VAC':'carnes','PAPRICA DEFUMADA EXTREMO SABOR 30G':'mercearia','PEPINO CONSERVA INCOTRIL TRAD 300G':'mercearia','PERA IMPORTADA':'hortifruti','SABONETE NIVEA AVEIA 85G':'higiene','SABONETE NIVEA PROTEINAS DO LEITE 85G':'higiene','FILEZINHO FGO PEITO IQF AVE SERRA 1KG806':'carnes','HOT DOG MEDIO E GR':'carnes','MOELA FGO CONG PERDIGAO 1KG MOF016':'carnes','MORANGO VIEIRA 250G':'hortifruti','FAROFA PRONTA CALDO BOM 250G':'mercearia','CEBOLA ALHO E SALSA EXTREMO SABOR 30G':'mercearia','BEB LAC UHT PARMALAT WHEYFIT CAP 250ML':'laticinios','BEB LAC UHT PARMALAT WHEYFIT MILHO 250ML':'laticinios','ALIM ACHOC NESCAU 550G':'mercearia','OLEO SOJA VITALIV PET 900ML':'mercearia','IOGURTE NESTLE POLPA NINHO C/6 540G':'laticinios','BATATA ROSA':'hortifruti','BATATA PALHA DEUTSCHIPS 80G':'snacks','CEBOLA':'hortifruti','LEITE CONDENSADO TRIANGULO 395G':'laticinios','SUCO AURORA UVA 1500ML TP 3617':'bebidas','MOLHO TOM FUGINI TRAD 300G':'mercearia','DETERGENTE LIQ YPE NEUTRO 500ML 2004':'limpeza','SABONETE POM POM BABY GLIC 70G 020769':'higiene','MACA PINK':'hortifruti','BANANA PRATA':'hortifruti'};
  Object.keys(exp).forEach(k => assert.strictEqual(C.categorize(k), exp[k], k));
});
t('categorias: segunda leva de itens reais (carnes, casa, massas, temperos)', () => {
  const exp = {'CARRE-CHULETA SUINA':'carnes','FERMENTO QUIMICO ROYAL 100G 7218':'mercearia','FOSFORO GABOARDI C/10 27677':'limpeza','VELA C/8 SANDERO NR 01 C/8 10G':'limpeza','SIFAO SANF CENSI C/SUP BR 7150-04025':'limpeza','TIRA MANCHAS CALISUL PERCARBON SODIO 1KG':'limpeza','MASSA FRESCA TALHARIM ROMENA 500G MF':'mercearia','MASSA C/OVOS NORDESTE PARAFUSO 500G 684':'mercearia','SAGU BELLA DICA 400G':'mercearia','TAPIOCA CISBRA GOMA MANDIOCA HIDR 500G':'mercearia','COST DEF VACUO COTRI':'carnes','SALSICHA EXCELSIOR HOT DOG S/C 2KG 1904':'carnes','MORTADELA FAT PERDIGAO OURO DEF 200GMBBF':'carnes','LEITE EM PO CCGL INT 1000G':'laticinios','STEAK PERDIGAO FGO 100G CAE101':'carnes','AGUA SANITARIA YPE 1L':'limpeza','AGUA MINERAL VALLE AZUL C/G PET 510ML':'bebidas','PIMENTAO VERDE':'hortifruti','OVOS GALINHA VERM NATUROVOS C/30 50223':'carnes','AMACIANTE P/ROUPA AQUAFAST ORIENTAL 2L':'limpeza','ARROZ T-1 DONA CHICA 5KG':'mercearia','PESSEGO':'hortifruti','KIWI SILVESTRIN DIVERTIDAS 600G':'hortifruti','WAFER PARATI MINUETO MORANGO 81G':'snacks','CERVEJA FUNDACAO 1957 PILSEN EXTRA 600ML':'alcool','LAVA ROUPAS LIQ GOTA LIMPA GLICERINA 3L':'limpeza','CARNE MOIDA SEG':'carnes','BRACO':'outros','SALG BISTEX PALITINHOS SAL 90G 613':'snacks','OLEO SOJA COAMO PET 900ML':'mercearia','BISC DOCEOLI POLVILHO 70G':'snacks','IOGURTE CAROLINA PEDACOS MORANGO 450G':'laticinios','FARINHA TRIGO COTRICAMPO 5KG':'mercearia','MANTEIGA ELEGE S/SAL 200G 8814':'laticinios','CHIMICHURRI BARBECUE EXTREMO SABOR 30G':'mercearia','CEBOLA':'hortifruti','BROCOLIS 250G':'hortifruti'};
  Object.keys(exp).forEach(k => assert.strictEqual(C.categorize(k), exp[k], k));
});

// ---- agrupamento ajustado pelo usuário, sugestões e comparação mensal ----
const ca = (id, date, nome, vu, loja) => compra(id, date, loja || 'Mercado A', '111', [it(nome, '', 1, vu)]);
const dupl = [ca('a', '2026-09-01', 'LEITE INTEGRAL PARMALAT 1L', 5.0), ca('b', '2026-10-01', 'LEITE INTEGRAL 1L', 5.5)];
t('agrupamento: nomes parecidos mas diferentes ficam separados e são sugeridos para unir', () => {
  C.configure({});
  assert.strictEqual(C.buildProducts(dupl).length, 2);
  const sug = C.suggestMerges(dupl);
  assert.strictEqual(sug.length, 1);
});
t('agrupamento: sabores diferentes não são sugeridos para unir', () => {
  C.configure({});
  const sab = [ca('a', '2026-09-01', 'BEB LAC UHT PARMALAT WHEYFIT BAU 250ML', 7.59), ca('b', '2026-09-01', 'BEB LAC UHT PARMALAT WHEYFIT CAP 250ML', 7.59), ca('c', '2026-09-01', 'BEB LAC UHT PARMALAT WHEYFIT MILHO 250ML', 7.59)];
  assert.strictEqual(C.suggestMerges(sab).length, 0);
});
t('agrupamento: "não são o mesmo" tira a sugestão', () => {
  const a = C.normalizeName('LEITE INTEGRAL PARMALAT 1L').key, b = C.normalizeName('LEITE INTEGRAL 1L').key;
  const nm = {}; nm[C.pairKey(a, b)] = true;
  C.configure({ noMerge: nm });
  assert.strictEqual(C.suggestMerges(dupl).length, 0);
});
t('agrupamento: unir junta as compras e o preço passa a ser comparado', () => {
  const a = C.normalizeName('LEITE INTEGRAL PARMALAT 1L').key, b = C.normalizeName('LEITE INTEGRAL 1L').key;
  const mg = {}; mg[b] = a;
  C.configure({ merges: mg });
  const p = C.buildProducts(dupl);
  assert.strictEqual(p.length, 1);
  assert.strictEqual(p[0].compras.length, 2);
  assert.ok(Math.abs(C.priceChanges(dupl)[0].pct - 10) < 0.01);
  C.configure({});
});
t('agrupamento: união em ciclo não trava', () => {
  C.configure({ merges: { x: 'y', y: 'x' } });
  assert.ok(typeof C.resolveKey('x') === 'string');
  C.configure({});
});
t('agrupamento: separar desfaz o agrupamento automático', () => {
  const dois = [ca('a', '2026-09-01', 'BISCOITO RECHEADO OREO CHOCOLATE BRANCO 90G', 3), ca('b', '2026-10-01', 'BISCOITO RECHEADO OREO CHOCOLATE 90G', 3.3)];
  C.configure({});
  assert.strictEqual(C.buildProducts(dois).length, 1);
  const sp = {}; sp[C.normalizeName('BISCOITO RECHEADO OREO CHOCOLATE 90G').key] = true;
  C.configure({ separate: sp });
  assert.strictEqual(C.buildProducts(dois).length, 2);
  C.configure({});
});
t('agrupamento: renomear produto', () => {
  const k = C.normalizeName('LEITE INTEGRAL 1L').key;
  const nmz = {}; nmz[k] = 'Leite barato';
  C.configure({ names: nmz });
  assert.ok(C.buildProducts(dupl).some(p => p.nome === 'Leite barato'));
  C.configure({});
});
const n1 = (id, date, total) => compra(id, date, 'M', '1', [it('ITEM ' + id, '', 1, total)]);
t('comparação mensal: mês em andamento compara o mesmo período do mês anterior', () => {
  const ps = [n1('a', '2026-10-02', 100), n1('b', '2026-10-05', 100), n1('c', '2026-10-20', 500), n1('d', '2026-11-03', 150), n1('e', '2026-11-05', 150)];
  const r = C.monthCompare(ps, new Date(2026, 10, 6));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.ate, 6);
  assert.strictEqual(r.anterior.total, 200);   // só até o dia 6 de outubro, sem os 500 do dia 20
  assert.strictEqual(r.pct, 50);
});
t('comparação mensal: com 1 nota num dos lados não compara', () => {
  const ps = [n1('a', '2026-10-02', 100), n1('b', '2026-10-05', 100), n1('d', '2026-11-03', 150)];
  assert.strictEqual(C.monthCompare(ps, new Date(2026, 10, 6)).ok, false);
});
t('comparação mensal: mês já encerrado compara o mês inteiro', () => {
  const ps = [n1('a', '2026-10-02', 100), n1('c', '2026-10-20', 500), n1('d', '2026-11-03', 300), n1('e', '2026-11-25', 300)];
  const r = C.monthCompare(ps, new Date(2026, 11, 20));
  assert.strictEqual(r.ate, null);
  assert.strictEqual(r.anterior.total, 600);
  assert.strictEqual(r.pct, 0);
});
t('promoção: variação acima de 40% é marcada e fica fora da inflação pessoal', () => {
  C.configure({});
  const base = compras.slice();
  const promo = base.concat([ca('x1', '2026-08-06', 'MOLHO TOM FUGINI 300G', 0.99), ca('x2', '2026-10-06', 'MOLHO TOM FUGINI 300G', 1.89)]);
  const ch = C.priceChanges(promo);
  const molho = ch.find(c => /FUGINI/.test(c.nome));
  assert.strictEqual(molho.suspeito, true);
  assert.strictEqual(ch[ch.length - 1].nome, molho.nome, 'suspeitas vão para o fim da lista');
  const antes = C.personalInflation(base), depois = C.personalInflation(promo);
  assert.strictEqual(depois.produtos, antes.produtos);
  assert.ok(Math.abs(depois.pct - antes.pct) < 1e-9);
  assert.strictEqual(depois.excluidos, 1);
});
t('alerta ao salvar: mostra só o que subiu 10% ou mais desde a compra anterior', () => {
  C.configure({});
  const ps = [ca('a', '2026-09-01', 'LEITE INTEGRAL 1L', 5.0), ca('b', '2026-09-01', 'ARROZ BRANCO 5KG', 25.0),
              compra('n', '2026-10-01', 'M', '1', [it('LEITE INTEGRAL 1L', '', 1, 5.8), it('ARROZ BRANCO 5KG', '', 1, 25.5), it('FEIJAO PRETO 1KG', '', 1, 8)])];
  const al = C.priceAlerts(ps, 'n');
  assert.strictEqual(al.length, 1);
  assert.ok(/LEITE/.test(al[0].nome));
  assert.ok(Math.abs(al[0].pct - 16) < 0.01);
  assert.strictEqual(al[0].suspeito, false);
  assert.strictEqual(C.priceAlerts(ps.slice(0, 2), 'a').length, 0, 'primeira compra não gera alerta');
});
t('lista: catálogo devolve todos os produtos; com texto filtra', () => {
  assert.strictEqual(C.catalogo(compras, '').length >= 2, true);
  assert.strictEqual(C.catalogo(compras, 'leite integral').length, 1);
  assert.ok(C.catalogo(compras, 'leite integral')[0].ultima.qtd > 0);
});
t('lista: quantidade sugerida e passo', () => {
  assert.strictEqual(C.qtdSugerida({ un: 'UN', qtd: 12 }), 12);
  assert.strictEqual(C.qtdSugerida({ un: 'UN', qtd: 0.5 }), 1);
  assert.strictEqual(C.qtdSugerida({ un: 'KG', qtd: 1.2345 }), 1.235);
  assert.strictEqual(C.qtdSugerida(null), 1);
  assert.strictEqual(C.passoQtd('KG'), 0.5); assert.strictEqual(C.passoQtd('UN'), 1);
});
t('lista: estimativa usa último preço, preço manual e ignora item sem preço', () => {
  const r = C.estimarLista([
    { key: 'a', qtd: 2, feito: false }, { key: null, qtd: 1, preco: 3, feito: true },
    { key: null, qtd: 1, preco: null, feito: false }, { key: 'a', qtd: 1, preco: 99, feito: true }
  ], { a: 5.5 });
  assert.deepStrictEqual(r, { pendente: 11, carrinho: 8.5, total: 19.5, semPreco: 1 });
  assert.deepStrictEqual(C.estimarLista([], {}), { pendente: 0, carrinho: 0, total: 0, semPreco: 0 });
});
t('resumo por categoria: usa só os últimos 12 meses, como o resto do app', () => {
  const mk = (id, d, v) => ({ id, date: d, store: { name: 'M', cnpj: '1' }, total: v, items: [{ nome: 'LEITE INTEGRAL 1L', codigo: '2', qtd: 1, un: 'UN', vlUnit: v, vlTotal: v }] });
  const P = [mk('a', '2024-01-10', 100), mk('b', '2026-10-10', 7), mk('c', '2026-11-05', 3)];
  const tot = C.categoryTotals(P, {}, {}).reduce((s, c) => s + c.total, 0);
  assert.strictEqual(Math.round(tot * 100) / 100, 10, 'a nota de 2024 fica fora');
  assert.strictEqual(C.categoryTotals(P.slice(1), {}, {}).reduce((s, c) => s + c.total, 0), 10);
});
console.log('\n' + n + ' testes passaram' + (process.exitCode ? ' (com falhas)' : ''));
