/* app.js — interface. Todos os dados ficam só neste aparelho (localStorage). */
(function () {
  'use strict';

  // ---------- armazenamento ----------
  const KEY = 'notas.v1';
  const mem = {};
  const store = {
    get: function () { try { return localStorage.getItem(KEY); } catch (e) { return mem[KEY] || null; } },
    set: function (v) { try { localStorage.setItem(KEY, v); } catch (e) { mem[KEY] = v; } }
  };
  const defaults = { purchases: [], overrides: {}, cutMap: {}, corte: 20, proxy: '' };
  let S = (function () {
    try { return Object.assign({}, defaults, JSON.parse(store.get() || '{}')); } catch (e) { return Object.assign({}, defaults); }
  })();
  function save() { store.set(JSON.stringify(S)); }

  // ---------- utilidades ----------
  const brl = function (n) { return (n == null || isNaN(n)) ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
  const pct = function (n) { return (n >= 0 ? '+' : '') + n.toFixed(1).replace('.', ',') + '%'; };
  const dataBR = function (iso) { return iso ? iso.split('-').reverse().join('/') : 'sem data'; };
  const mesBR = function (k) { const p = k.split('-'); return ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][+p[1] - 1] + '/' + p[0].slice(2); };

  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') el.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'class') el.className = attrs[k];
      else if (attrs[k] === true) el.setAttribute(k, '');
      else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
    });
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  const row = function (n, v, cls) { return h('div', { class: 'row' }, h('div', { class: 'n' }, n), h('div', { class: 'v ' + (cls || '') }, v)); };

  // ---------- estado de tela ----------
  let tab = 'home';
  let pending = null; // nota lida aguardando confirmação
  let stream = null, scanning = false;

  const view = document.getElementById('view');
  const sub = document.getElementById('sub');

  function render() {
    stopScan();
    view.replaceChildren();
    document.querySelectorAll('nav button').forEach(function (b) {
      if (b.dataset.t === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    sub.textContent = S.purchases.length + (S.purchases.length === 1 ? ' nota guardada' : ' notas guardadas') + ' neste aparelho';
    ({ home: viewHome, add: viewAdd, buys: viewBuys, prices: viewPrices, cfg: viewCfg })[tab]();
  }
  document.getElementById('nav').addEventListener('click', function (e) {
    const b = e.target.closest('button'); if (!b) return;
    tab = b.dataset.t; render();
  });

  // ---------- Resumo ----------
  function viewHome() {
    if (!S.purchases.length) {
      view.append(h('div', { class: 'card' },
        h('div', { class: 'big', text: 'Comece pela primeira nota' }),
        h('p', { class: 'mute', text: 'Escaneie o QR Code da nota fiscal do mercado. O app lê os itens e mostra, depois de algumas compras, o que subiu de preço e onde dá para cortar.' }),
        h('button', { class: 'primary', text: 'Adicionar nota', onclick: function () { tab = 'add'; render(); } })));
      return;
    }
    const months = Core.monthlyTotals(S.purchases);
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const card1 = h('div', { class: 'card' },
      h('div', { class: 'mute', text: last ? 'Gasto em ' + mesBR(last.mes) : 'Gasto' }),
      h('div', { class: 'big', text: last ? brl(last.total) : '—' }));
    if (prev && last) {
      const d = (last.total - prev.total) / prev.total * 100;
      card1.append(h('div', { class: 'mute' }, 'Mês anterior (' + mesBR(prev.mes) + '): ' + brl(prev.total) + ' ', h('span', { class: d > 0 ? 'up' : 'down', text: pct(d) })));
    }
    view.append(card1);

    const inf = Core.personalInflation(S.purchases);
    const card2 = h('div', { class: 'card' }, h('div', { class: 'mute', text: 'Sua inflação do mercado' }));
    if (inf.pct == null) {
      card2.append(h('div', { class: 'big', text: '—' }), h('div', { class: 'mute', text: 'Precisa de pelo menos 3 produtos comprados em datas diferentes (' + inf.produtos + ' até agora).' }));
    } else {
      card2.append(h('div', { class: 'big ' + (inf.pct > 0 ? 'up' : 'down'), text: pct(inf.pct) }),
        h('div', { class: 'mute', text: 'Média ponderada pelo gasto, em ' + inf.produtos + ' produtos que você repetiu. Compare com o IPCA de alimentos do IBGE.' }));
    }
    view.append(card2);

    // corte
    const cp = Core.cutPotential(S.purchases, S.overrides, S.cutMap, S.corte);
    const card3 = h('div', { class: 'card' }, h('div', { class: 'mute', text: 'Itens que você marcou como cortáveis' }));
    if (!cp.categorias.length) {
      card3.append(h('div', { text: 'Nenhuma categoria marcada ainda. Marque em Ajustes.' }));
    } else {
      card3.append(h('div', { class: 'big', text: brl(cp.totalPeriodo) }),
        h('div', { class: 'mute', text: 'em ' + cp.dias + ' dias (' + cp.categorias.map(function (c) { return c.nome; }).join(', ') + ')' }));
      const sel = h('select', { 'aria-label': 'Quanto cortar' });
      [10, 20, 30, 50].forEach(function (v) { sel.append(h('option', { value: v, selected: v === S.corte }, 'Cortar ' + v + '%')); });
      sel.addEventListener('change', function () { S.corte = +sel.value; save(); render(); });
      card3.append(h('div', { style: 'margin-top:10px' }, sel),
        h('p', { text: 'Se cortar ' + S.corte + '%, você economiza cerca de ' + brl(cp.economiaMensal) + ' por mês (' + brl(cp.economiaAnual) + ' por ano).' }));
      if (cp.ancorado) card3.append(h('div', { class: 'warn', text: 'Projeção feita com menos de 4 semanas de notas: trate como estimativa grosseira.' }));
    }
    view.append(card3);

    // categorias
    const cats = Core.categoryTotals(S.purchases, S.overrides, S.cutMap);
    const max = cats.length ? cats[0].total : 1;
    const card4 = h('div', { class: 'card' }, h('div', { class: 'mute', text: 'Para onde foi o dinheiro' }));
    cats.forEach(function (c) {
      card4.append(h('div', { style: 'margin-top:10px' },
        h('div', { class: 'row', style: 'border:0;padding:0' }, h('div', { class: 'n' }, c.nome, c.cortavel ? h('span', { class: 'tag', text: 'cortável' }) : null), h('div', { class: 'v', text: brl(c.total) })),
        h('div', { class: 'bar' + (c.cortavel ? ' cut' : '') }, h('i', { style: 'width:' + Math.max(2, c.total / max * 100) + '%' }))));
    });
    view.append(card4);
  }

  // ---------- Adicionar ----------
  function viewAdd() {
    if (pending) return viewReview();
    const msg = h('div', { id: 'msg' });
    const vid = h('video', { playsinline: true, muted: true, hidden: true, 'aria-label': 'Câmera' });
    const btnScan = h('button', { class: 'primary', text: 'Escanear QR Code da nota', onclick: function () { startScan(vid, msg); } });
    const inp = h('input', { type: 'text', placeholder: 'Endereço do QR Code ou chave de 44 dígitos', inputmode: 'url', autocomplete: 'off' });
    const btnGo = h('button', { text: 'Buscar nota', onclick: function () { handleInput(inp.value, msg); } });
    const ta = h('textarea', { placeholder: 'Cole aqui o texto da página da nota (plano B)' });
    const btnTxt = h('button', { text: 'Ler texto colado', onclick: function () { handleText(ta.value, msg, ''); } });

    view.append(
      h('div', { class: 'card' }, h('h2', { text: '1. Escanear' }), btnScan, h('div', { style: 'margin-top:10px' }, vid)),
      h('div', { class: 'card' }, h('h2', { text: '2. Colar o endereço' }),
        h('div', { class: 'mute', text: 'Se a câmera não ler, abra o QR Code do cupom no leitor do celular e copie o endereço.' }),
        h('div', { style: 'margin-top:8px' }, inp), h('div', { style: 'margin-top:8px' }, btnGo)),
      h('details', { class: 'card' }, h('summary', { text: '3. Plano B: colar o texto da nota' }),
        h('div', { class: 'mute', text: 'Abra a nota no navegador, selecione tudo, copie e cole aqui. Serve quando o site da SEFAZ pede CAPTCHA.' }),
        h('div', { style: 'margin-top:8px' }, ta), h('div', { style: 'margin-top:8px' }, btnTxt)),
      msg);
    if (!S.proxy) msg.append(h('div', { class: 'warn', text: 'Para buscar a nota pelo endereço, configure o proxy em Ajustes. Sem ele, use o plano B (colar o texto).' }));
  }

  function say(msg, text, isWarn) {
    msg.replaceChildren(h('div', { class: isWarn ? 'warn' : 'mute', text: text }));
  }

  async function handleInput(raw, msg) {
    raw = String(raw || '').trim();
    if (!raw) return say(msg, 'Cole o endereço do QR Code primeiro.', true);
    const urlMatch = raw.match(/https?:\/\/[^\s"'<>]+/i);
    const chave = NFParser.extractChave(raw);
    if (!urlMatch) {
      if (chave) return say(msg, 'Só com a chave não dá para buscar a nota: cada estado tem um site. Cole o endereço completo do QR Code ou use o plano B.', true);
      return say(msg, 'Não achei um endereço nem uma chave de 44 dígitos.', true);
    }
    if (!S.proxy) {
      const campo = view.querySelector('input[type=text]');
      if (campo) campo.value = urlMatch[0];
      msg.replaceChildren(
        h('div', { class: 'warn', text: 'QR Code lido! Sem o proxy o app não busca a nota sozinho. Faça assim: toque em "Abrir a nota", copie o texto da página, volte aqui e cole no plano B (opção 3).' }),
        h('a', { class: 'btn', href: urlMatch[0], target: '_blank', rel: 'noopener noreferrer', style: 'display:inline-block;text-decoration:none;line-height:24px', text: 'Abrir a nota' }));
      const det = view.querySelector('details'); if (det) det.open = true;
      return;
    }
    say(msg, 'Buscando a nota…');
    try {
      const res = await fetch(S.proxy + (S.proxy.indexOf('?') >= 0 ? '&' : '?') + 'u=' + encodeURIComponent(urlMatch[0]));
      if (!res.ok) return say(msg, 'O site da SEFAZ respondeu com erro ' + res.status + '. Tente o plano B.', true);
      const text = await res.text();
      handleText(text, msg, raw);
    } catch (e) {
      say(msg, 'Não consegui falar com o proxy. Confira o endereço em Ajustes ou use o plano B.', true);
    }
  }

  function handleText(text, msg, origem) {
    if (!String(text || '').trim()) return say(msg, 'Nada para ler.', true);
    if (/captcha|n[ãa]o sou um rob[ôo]/i.test(text) && !/Vl\.?\s*Unit|txtTit/i.test(text)) {
      return say(msg, 'O site pediu CAPTCHA. Abra a nota no navegador, resolva, copie o texto e use o plano B.', true);
    }
    let r;
    try { r = NFParser.parseAny(text); } catch (e) { return say(msg, 'Erro ao ler a nota: ' + e.message, true); }
    if (!r.items.length) return say(msg, 'Não consegui achar itens nessa página. Se o texto da nota estiver na tela, use o plano B e me mande um exemplo para eu ajustar o leitor (sem CPF).', true);
    if (!r.chave) { const k = NFParser.extractChave(origem); if (k) r.chave = k; }
    pending = r; render();
  }

  // ---------- câmera ----------
  async function startScan(vid, msg) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return say(msg, 'Este navegador não deixa usar a câmera aqui. Use a opção 2.', true);
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) { return say(msg, 'Sem permissão para a câmera. Use a opção 2.', true); }
    vid.hidden = false; vid.srcObject = stream; await vid.play().catch(function () {});
    scanning = true;
    let detector = null, canvas = null, ctx = null;
    if ('BarcodeDetector' in window) {
      try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
    }
    if (!detector) {
      try { await loadJsQR(); canvas = document.createElement('canvas'); ctx = canvas.getContext('2d', { willReadFrequently: true }); }
      catch (e) { stopScan(); return say(msg, 'Não consegui carregar o leitor de QR. Use a opção 2.', true); }
    }
    say(msg, 'Aponte para o QR Code do cupom…');
    const tick = async function () {
      if (!scanning) return;
      try {
        let value = null;
        if (detector) {
          const codes = await detector.detect(vid);
          if (codes.length) value = codes[0].rawValue;
        } else if (vid.videoWidth) {
          canvas.width = vid.videoWidth; canvas.height = vid.videoHeight;
          ctx.drawImage(vid, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const c = window.jsQR(img.data, img.width, img.height);
          if (c) value = c.data;
        }
        if (value) { stopScan(); vid.hidden = true; return handleInput(value, msg); }
      } catch (e) { /* continua tentando */ }
      setTimeout(tick, 250);
    };
    tick();
  }
  function stopScan() {
    scanning = false;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
  }
  function loadJsQR() {
    return new Promise(function (ok, fail) {
      if (window.jsQR) return ok();
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
      s.onload = ok; s.onerror = fail; document.head.append(s);
    });
  }

  // ---------- revisão ----------
  function viewReview() {
    const r = pending;
    const dup = r.chave && S.purchases.some(function (p) { return p.chave === r.chave; });
    const dateInp = h('input', { type: 'text', value: r.date ? dataBR(r.date) : '', placeholder: 'dd/mm/aaaa', inputmode: 'numeric' });
    const card = h('div', { class: 'card' },
      h('div', { class: 'mute', text: 'Confira antes de salvar' }),
      h('div', { class: 'big', text: brl(r.total) }),
      h('div', { class: 'mute', text: (r.store.name || 'Loja não identificada') + (r.uf ? ' · ' + r.uf : '') }),
      h('label', { text: 'Data da compra' }), dateInp);
    if (dup) card.append(h('div', { class: 'warn', text: 'Esta nota já foi salva antes. Salvar de novo duplicaria os gastos.' }));
    r.warnings.forEach(function (w) { card.append(h('div', { class: 'warn', text: w })); });
    if (r.chave && !NFParser.parseChave(r.chave).valid) card.append(h('div', { class: 'warn', text: 'A chave de acesso não passou na conferência. Pode ter sido lida errado.' }));
    view.append(card);

    const list = h('div', { class: 'card' }, h('div', { class: 'mute', text: r.items.length + ' itens (toque em remover para tirar um que veio errado)' }));
    r.items.forEach(function (it, i) {
      list.append(h('div', { class: 'row' },
        h('div', { class: 'n' }, it.nome, h('div', { class: 'mute', text: it.qtd + ' ' + it.un + ' × ' + brl(it.vlUnit) + (it.check ? ' (conferir)' : '') })),
        h('div', { class: 'v' }, brl(it.vlTotal), ' ', h('button', { text: 'remover', 'aria-label': 'Remover ' + it.nome, onclick: function () { r.items.splice(i, 1); render(); } }))));
    });
    view.append(list);
    view.append(h('div', { class: 'flex' },
      h('button', { text: 'Descartar', onclick: function () { pending = null; render(); } }),
      h('button', { class: 'primary', text: 'Salvar nota', disabled: dup, onclick: function () {
        const iso = NFParser.toISODate(dateInp.value) || r.date;
        if (!iso) { dateInp.focus(); return alert('Informe a data da compra (dd/mm/aaaa).'); }
        const total = r.items.reduce(function (s, i) { return s + i.vlTotal; }, 0);
        S.purchases.push({
          id: 'n' + Date.now(), chave: r.chave || '', uf: r.uf || '', date: iso, store: r.store,
          total: Math.round(total * 100) / 100, items: r.items.map(function (i) { return { nome: i.nome, codigo: i.codigo, qtd: i.qtd, un: i.un, vlUnit: i.vlUnit, vlTotal: i.vlTotal }; })
        });
        save(); pending = null; tab = 'home'; render();
      } })));
  }

  // ---------- Compras ----------
  function viewBuys() {
    if (!S.purchases.length) return view.append(h('div', { class: 'card', text: 'Nenhuma nota ainda.' }));
    S.purchases.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).forEach(function (p) {
      const d = h('details', { class: 'card' },
        h('summary', null, h('span', null, dataBR(p.date) + ' · ' + (p.store.name || 'Loja') + ' · ' + brl(p.total))));
      p.items.forEach(function (it) { d.append(row(it.nome, brl(it.vlTotal))); });
      d.append(h('div', { style: 'margin-top:10px' }, h('button', { class: 'danger', text: 'Apagar esta nota', onclick: function () {
        if (confirm('Apagar esta nota?')) { S.purchases = S.purchases.filter(function (x) { return x.id !== p.id; }); save(); render(); }
      } })));
      view.append(d);
    });
  }

  // ---------- Preços ----------
  function viewPrices() {
    const ch = Core.priceChanges(S.purchases);
    const card = h('div', { class: 'card' }, h('h2', { text: 'O que mudou de preço' }),
      h('div', { class: 'mute', text: 'Primeiro preço comparado ao último, por kg, litro ou unidade. Produtos parecidos são agrupados pelo nome; confira se faz sentido.' }));
    if (!ch.length) card.append(h('p', { text: 'Ainda não há produtos comprados em duas datas diferentes.' }));
    ch.slice(0, 15).forEach(function (c) {
      card.append(h('div', { class: 'row' },
        h('div', { class: 'n' }, c.nome, h('div', { class: 'mute', text: brl(c.de) + ' → ' + brl(c.para) + ' por ' + c.rotulo })),
        h('div', { class: 'v ' + (c.pct > 0 ? 'up' : 'down'), text: pct(c.pct) })));
    });
    view.append(card);
    const sc = Core.storeCompare(S.purchases);
    const card2 = h('div', { class: 'card' }, h('h2', { text: 'Onde ficou mais barato' }),
      h('div', { class: 'mute', text: 'Só para produtos que você comprou em 2 ou mais lojas.' }));
    if (!sc.length) card2.append(h('p', { text: 'Sem comparação ainda.' }));
    sc.slice(0, 10).forEach(function (c) {
      card2.append(h('div', { class: 'row' },
        h('div', { class: 'n' }, c.nome, h('div', { class: 'mute', text: (c.barata.loja || 'loja') + ' ' + brl(c.barata.preco.valor) + ' vs ' + (c.cara.loja || 'loja') + ' ' + brl(c.cara.preco.valor) })),
        h('div', { class: 'v down', text: '−' + c.economiaPct.toFixed(0) + '%' })));
    });
    view.append(card2);
  }

  // ---------- Ajustes ----------
  function viewCfg() {
    const proxy = h('input', { type: 'url', value: S.proxy, placeholder: 'https://notas-proxy.seunome.workers.dev', inputmode: 'url' });
    view.append(h('div', { class: 'card' }, h('h2', { text: 'Proxy de leitura' }),
      h('div', { class: 'mute', text: 'Endereço do seu Cloudflare Worker (veja o README). Ele só repassa a página pública da nota; não guarda nada.' }),
      h('div', { style: 'margin-top:8px' }, proxy),
      h('div', { style: 'margin-top:8px' }, h('button', { class: 'primary', text: 'Salvar', onclick: function () { S.proxy = proxy.value.trim(); save(); alert('Salvo.'); } }))));

    const card = h('div', { class: 'card' }, h('h2', { text: 'O que é cortável para você' }),
      h('div', { class: 'mute', text: 'Você decide. O app só soma quanto sai de cada categoria marcada.' }));
    Core.CATEGORIES.forEach(function (c) {
      const on = c.id in S.cutMap ? S.cutMap[c.id] : c.cortavel;
      const cb = h('input', { type: 'checkbox', id: 'c_' + c.id, checked: on });
      cb.addEventListener('change', function () { S.cutMap[c.id] = cb.checked; save(); });
      card.append(h('div', { class: 'row' }, h('label', { for: 'c_' + c.id, style: 'margin:0;color:inherit;font-size:16px;flex:1' }, c.nome), cb));
    });
    view.append(card);

    const imp = h('input', { type: 'file', accept: 'application/json', hidden: true });
    imp.addEventListener('change', function () {
      const f = imp.files[0]; if (!f) return;
      f.text().then(function (t) {
        try { const d = JSON.parse(t); if (!Array.isArray(d.purchases)) throw 0; S = Object.assign({}, defaults, d); save(); render(); alert('Dados importados.'); }
        catch (e) { alert('Arquivo inválido.'); }
      });
    });
    view.append(h('div', { class: 'card' }, h('h2', { text: 'Seus dados' }),
      h('div', { class: 'mute', text: 'Ficam só neste aparelho. Se limpar os dados do navegador, somem: exporte de vez em quando.' }),
      h('div', { class: 'flex', style: 'margin-top:10px' },
        h('button', { text: 'Exportar', onclick: function () {
          const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' })), download: 'notas-' + new Date().toISOString().slice(0, 10) + '.json' });
          document.body.append(a); a.click(); a.remove();
        } }),
        h('button', { text: 'Importar', onclick: function () { imp.click(); } }), imp),
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'danger', text: 'Apagar tudo', onclick: function () {
        if (confirm('Apagar todas as notas e ajustes deste aparelho?')) { S = Object.assign({}, defaults); save(); render(); }
      } }))));
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
  render();
})();
