/* parser.js — leitura de chave de acesso e de itens de NFC-e.
 * Funciona no navegador (window.NFParser) e no Node (module.exports).
 * IMPORTANTE: os layouts das páginas da SEFAZ variam por estado e mudam sem aviso.
 * Este parser tenta 3 estratégias e sempre devolve "warnings" quando algo parece estranho.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NFParser = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const UF = {
    '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
    '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
    '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR', '42': 'SC', '43': 'RS',
    '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
  };

  // ---------- números e datas ----------
  function num(s) {
    if (s == null) return NaN;
    let t = String(s).replace(/[^\d,.\-]/g, '');
    if (!t) return NaN;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    const n = parseFloat(t);
    return isNaN(n) ? NaN : n;
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  function toISODate(s) {
    const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  // ---------- chave de acesso ----------
  function extractChave(input) {
    const s = String(input || '');
    let m = s.match(/(?<!\d)\d{44}(?!\d)/);
    if (m) return m[0];
    // chave impressa em grupos de 4 dígitos separados por espaço
    const squeezed = s.replace(/(\d)[\s.]+(?=\d)/g, '$1');
    m = squeezed.match(/(?<!\d)\d{44}(?!\d)/);
    return m ? m[0] : null;
  }

  function validChave(chave) {
    if (!/^\d{44}$/.test(chave || '')) return false;
    let sum = 0, w = 2;
    for (let i = 42; i >= 0; i--) {
      sum += parseInt(chave[i], 10) * w;
      w = w === 9 ? 2 : w + 1;
    }
    const r = sum % 11;
    const dv = r < 2 ? 0 : 11 - r;
    return dv === parseInt(chave[43], 10);
  }

  function parseChave(chave) {
    if (!/^\d{44}$/.test(chave || '')) return null;
    return {
      uf: UF[chave.slice(0, 2)] || '??',
      aamm: chave.slice(2, 6),
      cnpj: chave.slice(6, 20),
      modelo: chave.slice(20, 22),
      serie: chave.slice(22, 25),
      numero: chave.slice(25, 34),
      valid: validChave(chave)
    };
  }

  // ---------- estratégia A: layout com classes txtTit / Rqtd / RvlUnit ----------
  function lastNum(text) {
    const m = String(text || '').match(/([\d.]*\d,\d+|\d+(?:\.\d+)?)\s*$/);
    return m ? num(m[1]) : NaN;
  }

  function parseTabResult(doc) {
    const items = [];
    const names = doc.querySelectorAll('.txtTit');
    names.forEach(function (el) {
      const row = el.closest('tr') || el.parentElement;
      if (!row) return;
      const q = function (sel) { const e = row.querySelector(sel); return e ? e.textContent.trim() : ''; };
      const nome = el.textContent.replace(/\s+/g, ' ').trim();
      const qtd = lastNum(q('.Rqtd'));
      const vu = lastNum(q('.RvlUnit'));
      const vt = lastNum(q('.valor'));
      if (!nome || isNaN(qtd) || (isNaN(vu) && isNaN(vt))) return;
      const un = (q('.RUN').split(':').pop() || '').trim().toUpperCase() || 'UN';
      const cod = (q('.RCod').match(/(\d+)/) || [])[1] || '';
      const total = !isNaN(vt) ? vt : round2(qtd * vu);
      const unit = !isNaN(vu) ? vu : (qtd ? round2(total / qtd) : total);
      items.push({ nome: nome, codigo: cod, qtd: qtd, un: un, vlUnit: unit, vlTotal: total });
    });
    return items;
  }

  // ---------- estratégia B: texto corrido da página ----------
  function parseCollapsedText(text) {
    const items = [];
    const tail = /\(\s*C[óo]digo:?\s*(\d+)\s*\)\s*Qtde\.?:?\s*([\d.,]+)\s*UN:?\s*([A-Za-z]{1,4})\s*Vl\.?\s*Unit\.?:?\s*([\d.,]+)\s*Vl\.?\s*Total\s*([\d.,]+)/gi;
    let prevEnd = 0, m;
    while ((m = tail.exec(text)) !== null) {
      let nome = text.slice(prevEnd, m.index).trim();
      if (!items.length) {
        // o primeiro item vem colado ao cabeçalho: corta até o último marcador conhecido
        nome = nome.replace(/^.*(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|Vl\.?\s*Total|Valor\s*Total|Descri[cç][ãa]o(?:\s+do\s+produto)?|C[óo]digo\s+Descri[cç][ãa]o)\s*/i, '');
      }
      prevEnd = m.index + m[0].length;
      nome = nome.replace(/\s+/g, ' ').trim();
      // páginas reais repetem "Vl. Total 17,90" depois do item: isso não é nome de produto
      nome = nome.replace(/^(?:Vl\.?\s*(?:Total|Unit\.?)\s*:?\s*(?:R\$\s*)?[\d.,]+\s*)+/i, '').trim();
      if (!nome) continue;
      items.push({ nome: nome, codigo: m[1], qtd: num(m[2]), un: m[3].toUpperCase(), vlUnit: num(m[4]), vlTotal: num(m[5]) });
    }
    return items;
  }

  // ---------- estratégia C: linhas de cupom em texto puro ----------
  function parseLines(text) {
    const items = [];
    const re = /^\s*(?:\d{1,3}\s+)?(?:(\d{6,14})\s+)?(.+?)\s+([\d.,]+)\s*(UN|UND|KG|LT|L|PC|CX|PCT|G|ML)?\s*[xX*]\s*([\d.,]+)\s+([\d.,]+)\s*$/;
    String(text).split(/\r?\n/).forEach(function (line) {
      const m = line.match(re);
      if (!m) return;
      const nome = m[2].trim();
      const qtd = num(m[3]), vu = num(m[5]), vt = num(m[6]);
      if (!nome || isNaN(qtd) || isNaN(vu) || isNaN(vt)) return;
      items.push({ nome: nome, codigo: m[1] || '', qtd: qtd, un: (m[4] || 'UN').toUpperCase(), vlUnit: vu, vlTotal: vt });
    });
    return items;
  }

  // ---------- cabeçalho ----------
  function parseHeader(text, doc) {
    const out = { store: { name: '', cnpj: '' }, date: null, total: NaN };
    if (doc) {
      const top = doc.querySelector('.txtTopo, #u20, .NFCCabecalho_SubTitulo');
      if (top) out.store.name = top.textContent.replace(/\s+/g, ' ').trim();
    }
    const c = text.match(/CNPJ:?\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/i);
    if (c) out.store.cnpj = c[1].replace(/\D/g, '');
    const d = text.match(/Emiss[ãa]o:?\s*(\d{2}\/\d{2}\/\d{4})/i) || text.match(/(\d{2}\/\d{2}\/\d{4})/);
    if (d) out.date = toISODate(d[1]);
    const t = text.match(/Valor\s+(?:a\s+pagar|total)\s*(?:R\$)?\s*:?\s*R?\$?\s*([\d.,]+)/i);
    if (t) out.total = num(t[1]);
    return out;
  }

  // Nome da loja: texto antes de "CNPJ" na primeira linha que o contém (ou a linha anterior).
  function storeFromLines(text) {
    const lines = String(text).split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^(.*?)\s*CNPJ\b/i);
      if (!m) continue;
      let nome = m[1].replace(/[\s:\-–|,.]+$/, '');
      if (nome.length < 3 && i > 0) nome = lines[i - 1];
      nome = nome.replace(/\s+/g, ' ').trim();
      if (nome.length >= 3 && nome.length <= 80 && !/^(NFC|DANFE|Documento|Consulta)/i.test(nome)) return nome;
      return '';
    }
    return '';
  }

  // ---------- API ----------
  function finish(items, header, chaveSrc, strategy) {
    const warnings = [];
    const clean = [];
    items.forEach(function (it) {
      let qtd = it.qtd, vu = it.vlUnit, vt = it.vlTotal;
      if (isNaN(vt) && !isNaN(qtd) && !isNaN(vu)) vt = round2(qtd * vu);
      if (isNaN(vu) && !isNaN(qtd) && qtd && !isNaN(vt)) vu = round2(vt / qtd);
      if (isNaN(qtd) || isNaN(vu) || isNaN(vt)) return;
      const check = Math.abs(qtd * vu - vt) > 0.06 * Math.max(1, qtd);
      clean.push({ nome: it.nome, codigo: it.codigo || '', qtd: qtd, un: it.un || 'UN', vlUnit: vu, vlTotal: vt, check: check });
    });
    const sum = round2(clean.reduce(function (a, i) { return a + i.vlTotal; }, 0));
    let total = header.total;
    if (isNaN(total)) total = sum;
    if (clean.length && Math.abs(sum - total) > 0.5) {
      warnings.push('A soma dos itens (' + sum.toFixed(2) + ') difere do total da nota (' + total.toFixed(2) + '). Confira os itens.');
    }
    if (clean.some(function (i) { return i.check; })) warnings.push('Alguns itens têm quantidade × valor diferente do total. Confira.');
    const chave = extractChave(chaveSrc);
    const info = chave ? parseChave(chave) : null;
    return {
      items: clean, store: header.store, date: header.date, total: total, chave: chave,
      uf: info ? info.uf : null, strategy: strategy, warnings: warnings
    };
  }

  function parseDoc(doc) {
    const text = (doc.body ? doc.body.textContent : doc.documentElement.textContent || '').replace(/\s+/g, ' ');
    const header = parseHeader(text, doc);
    let items = parseTabResult(doc), strategy = 'classes';
    if (!items.length) { items = parseCollapsedText(text); strategy = 'texto'; }
    return finish(items, header, text, strategy);
  }

  function parseText(str) {
    const text = String(str || '');
    const collapsed = text.replace(/\s+/g, ' ');
    const header = parseHeader(collapsed, null);
    if (!header.store.name) header.store.name = storeFromLines(text);
    let items = [], strategy = 'texto';
    // 1) uma linha por item (texto copiado de página com quebras de linha)
    text.split(/\r?\n/).forEach(function (line) {
      const one = parseCollapsedText(line.replace(/\s+/g, ' ').trim());
      if (one.length === 1) items.push(one[0]);
    });
    // 2) tudo corrido numa linha só
    if (!items.length) items = parseCollapsedText(collapsed);
    if (!items.length) { items = parseLines(text); strategy = 'linhas'; }
    return finish(items, header, text, strategy);
  }

  // Aceita HTML (string) ou texto colado. DP = DOMParser (passado nos testes em Node).
  function parseAny(str, DP) {
    const s = String(str || '');
    const Parser = DP || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (/<(html|body|table|div|span)\b/i.test(s) && Parser) {
      const doc = new Parser().parseFromString(s, 'text/html');
      const r = parseDoc(doc);
      if (r.items.length) return r;
    }
    return parseText(s.replace(/<[^>]+>/g, '\n'));
  }

  return { UF: UF, num: num, extractChave: extractChave, validChave: validChave, parseChave: parseChave, parseAny: parseAny, parseText: parseText, parseDoc: parseDoc, toISODate: toISODate };
});
