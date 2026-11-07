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
  const VERSION = '0.6';
  const CFG = window.NOTAS_CONFIG || {};
  const defaults = { purchases: [], overrides: {}, cutMap: {}, corte: 20, proxy: '', auto: true, seen: false, lastBackup: '', backupSnooze: '', merges: {}, separate: {}, names: {}, noMerge: {}, meta: 0 };
  let editMeta = false; // formulário da meta mensal aberto na tela inicial
  let S = (function () {
    try { return Object.assign({}, defaults, JSON.parse(store.get() || '{}')); } catch (e) { return Object.assign({}, defaults); }
  })();
  function save() { store.set(JSON.stringify(S)); }
  // Endereço do proxy: o que a pessoa digitou em Ajustes ou, se vazio, o padrão do app (index.html).
  function proxyUrl() { return S.proxy || CFG.proxy || ''; }

  // ---------- backup ----------
  const DIA = 864e5;
  function markBackup() { S.lastBackup = new Date().toISOString(); save(); }
  function needsBackup() {
    if (S.purchases.length < 3) return false;
    const agora = Date.now();
    const last = S.lastBackup ? Date.parse(S.lastBackup) : 0;
    const snooze = S.backupSnooze ? Date.parse(S.backupSnooze) : 0;
    return agora - last > 30 * DIA && agora > snooze;
  }
  // Abre o menu Compartilhar do celular (Drive, WhatsApp, e-mail…). Sem suporte, baixa o arquivo.
  async function exportBackup() {
    const name = 'notas-' + new Date().toISOString().slice(0, 10) + '.json';
    const json = JSON.stringify(S, null, 1);
    const tipos = ['application/json', 'text/plain'];
    for (let i = 0; i < tipos.length; i++) {
      let file = null;
      try { file = new File([json], name, { type: tipos[i] }); } catch (e) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Backup Caderninho do Mercado' }); markBackup(); return true; }
        catch (e) { if (e && e.name === 'AbortError') return false; }
      }
    }
    const a = h('a', { href: URL.createObjectURL(new Blob([json], { type: 'application/json' })), download: name });
    document.body.append(a); a.click(); a.remove();
    markBackup();
    toast('Backup baixado. Guarde o arquivo no Drive ou em outro lugar seguro.');
    return true;
  }

  // ---------- relatório de problema (sem CPF) ----------
  let lastRead = null; // última nota lida nesta sessão (só na memória)
  function plainText(str) {
    str = String(str || '');
    if (/<(html|body|table|div|span)\b/i.test(str) && typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(str, 'text/html');
      doc.querySelectorAll('script,style,noscript').forEach(function (e) { e.remove(); });
      str = (doc.body ? doc.body.textContent : '') || '';
    }
    return str.replace(/[ \t\u00a0]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  }
  function scrubCpf(t) {
    return String(t || '')
      .replace(/(CPF[^0-9\n]{0,20})(\d{3}\.?\d{3}\.?\d{3}-?\d{2})/gi, '$1[removido]')
      .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF removido]');
  }
  // Os 2 primeiros dígitos da chave de acesso são o código do estado.
  const UF_COD = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA', 31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
  const UF_TESTADAS = ['RS'];
  function ufDaChave(chave) { return UF_COD[String(chave || '').slice(0, 2)] || ''; }
  function dicaUf(uf) {
    return uf && UF_TESTADAS.indexOf(uf) < 0
      ? ' Ainda estamos testando a leitura automática em ' + uf + ': até agora só o RS foi testado. O plano B (colar o texto da nota) funciona em qualquer estado, e o botão "Enviar problema" em Ajustes ajuda a gente a melhorar.'
      : '';
  }
  function buildReport(obs, text) {
    return ['Relatório do Caderninho do Mercado', 'Versão: ' + VERSION, 'Data: ' + new Date().toISOString().slice(0, 10),
      'Estado da nota: ' + (lastRead && lastRead.uf ? lastRead.uf : 'não identificado'),
      'Resultado da leitura: ' + (lastRead && lastRead.summary ? lastRead.summary : 'não informado'),
      'O que deu errado: ' + (obs || 'não informado'), '', '--- texto da nota ---', scrubCpf(text).slice(0, 60000)].join('\n');
  }

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

  function storeLabel(store) {
    if (store && store.name) return store.name;
    if (store && store.cnpj && store.cnpj.length === 14) return 'CNPJ ' + store.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    return 'Loja';
  }
  function isDup(r) {
    return S.purchases.some(function (p) {
      if (r.chave && p.chave) return p.chave === r.chave;
      return p.date === r.date && Math.abs(p.total - r.total) < 0.01 && ((p.store && p.store.cnpj) || '') === ((r.store && r.store.cnpj) || '');
    });
  }
  // Salva a nota lida. Devolve o registro guardado.
  function commit(r, iso, storeName) {
    const total = r.items.reduce(function (s, i) { return s + i.vlTotal; }, 0);
    const rec = {
      id: 'n' + Date.now(), chave: r.chave || '', uf: r.uf || '', date: iso,
      store: { name: storeName || '', cnpj: (r.store && r.store.cnpj) || '' },
      total: Math.round(total * 100) / 100,
      items: r.items.map(function (i) { return { nome: i.nome, codigo: i.codigo, qtd: i.qtd, un: i.un, vlUnit: i.vlUnit, vlTotal: i.vlTotal }; })
    };
    S.purchases.push(rec); save();
    return rec;
  }
  // Salva sem perguntar só quando tudo confere.
  function autoOk(r) {
    return !!(r.date && r.items.length && !r.warnings.length && !r.items.some(function (i) { return i.check; }) &&
      (!r.chave || NFParser.parseChave(r.chave).valid));
  }
  let alertas = null; // preços que subiram na última nota salva (só na memória)
  function registrarAlertas(rec) { alertas = { itens: Core.priceAlerts(S.purchases, rec.id) }; }
  let toastTimer = null;
  function toast(text, undo) {
    const old = document.getElementById('toast'); if (old) old.remove();
    clearTimeout(toastTimer);
    const t = h('div', { class: 'toast', id: 'toast', role: 'status' }, h('span', { text: text }));
    if (undo) t.append(h('button', { text: 'Desfazer', onclick: function () { undo(); t.remove(); } }));
    document.body.append(t);
    toastTimer = setTimeout(function () { t.remove(); }, 8000);
  }

  // ---------- estado de tela ----------
  let tab = 'home';
  let pending = null; // nota lida aguardando confirmação
  let stream = null, scanning = false;

  const view = document.getElementById('view');
  const sub = document.getElementById('sub');

  function render() {
    stopScan();
    Core.configure({ merges: S.merges, separate: S.separate, names: S.names, noMerge: S.noMerge });
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
  // Meta mensal: barra de progresso do mês atual. O estado vai em texto, não só em cor.
  function goalCard() {
    const g = Core.goalStatus(S.purchases, S.meta);
    const card = h('div', { class: 'card' });
    const form = function () {
      const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: 'Ex.: 900', 'aria-label': 'Meta de gasto do mês em reais', value: S.meta ? String(S.meta).replace('.', ',') : '' });
      const erro = h('div', { class: 'warn', hidden: true, text: 'Digite um valor em reais, como 900 ou 1.200,50.' });
      const salvar = function () {
        const v = Core.parseMoney(inp.value);
        if (v == null) { erro.hidden = false; return; }
        S.meta = v; editMeta = false; save(); render();
      };
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') salvar(); });
      return h('div', { style: 'margin-top:8px' }, h('label', { text: 'Quanto você quer gastar por mês no mercado? (R$)' }), inp, erro,
        h('div', { class: 'flex', style: 'margin-top:8px' },
          h('button', { class: 'primary', text: 'Salvar meta', onclick: salvar }),
          h('button', { text: 'Cancelar', onclick: function () { editMeta = false; render(); } }),
          S.meta ? h('button', { text: 'Remover', onclick: function () { S.meta = 0; editMeta = false; save(); render(); } }) : null));
    };
    if (!g) {
      card.append(h('strong', { text: 'Meta do mês' }),
        h('div', { class: 'mute', text: 'Defina quanto quer gastar por mês no mercado e acompanhe aqui, nota a nota.' }));
      if (editMeta) card.append(form());
      else card.append(h('div', { style: 'margin-top:8px' }, h('button', { class: 'sm', text: 'Definir meta', onclick: function () { editMeta = true; render(); } })));
      return card;
    }
    card.append(h('div', { class: 'mute', text: 'Meta do mês · ' + mesBR(g.mes) }),
      h('div', { class: 'big', text: brl(g.gasto) + ' de ' + brl(g.meta) }));
    const bar = h('div', { class: 'meta-bar ' + g.situacao, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': g.meta, 'aria-valuenow': Math.min(g.gasto, g.meta), 'aria-label': 'Gasto do mês em relação à meta' },
      h('i', { style: 'width:' + Math.min(100, Math.max(g.gasto > 0 ? 2 : 0, g.pct)).toFixed(1) + '%' }));
    card.append(bar);
    const dias = g.diasRestantes === 0 ? 'hoje é o último dia do mês' : (g.diasRestantes === 1 ? 'falta 1 dia para acabar o mês' : 'faltam ' + g.diasRestantes + ' dias para acabar o mês');
    let txt;
    if (!g.notas) txt = 'Ainda sem notas neste mês · ' + dias + '.';
    else if (g.situacao === 'passou') txt = 'Passou ' + brl(-g.restante) + ' da meta (' + g.pct.toFixed(0) + '%) · ' + dias + '.';
    else if (g.situacao === 'perto') txt = 'Atenção: já usou ' + g.pct.toFixed(0) + '% da meta. Restam ' + brl(g.restante) + ' · ' + dias + '.';
    else txt = 'Usou ' + g.pct.toFixed(0) + '% da meta. Restam ' + brl(g.restante) + ' · ' + dias + '.';
    card.append(h('div', { text: txt }));
    if (g.projecao != null) {
      card.append(h('div', { class: 'mute', style: 'margin-top:6px', text: 'No ritmo de agora, o mês fecharia em cerca de ' + brl(g.projecao) + (g.projecao > g.meta ? ', acima da meta' : ', dentro da meta') + '. É só uma estimativa: compras grandes mudam bastante.' }));
    }
    if (editMeta) card.append(form());
    else card.append(h('div', { style: 'margin-top:8px' }, h('button', { class: 'sm', text: 'Alterar meta', onclick: function () { editMeta = true; render(); } })));
    return card;
  }

  function viewHome() {
    if (!S.seen && !S.purchases.length) {
      view.append(h('div', { class: 'card' },
        h('div', { class: 'big', text: 'Bem-vindo' }),
        h('p', { text: 'O Caderninho do Mercado lê a nota fiscal das suas compras e mostra para onde vai o dinheiro, o que subiu de preço e quanto dá para economizar.' }),
        h('p', null, h('strong', { text: '1. ' }), 'Toque em Adicionar e escaneie o QR Code da nota (NFC-e).'),
        h('p', null, h('strong', { text: '2. ' }), 'Confira o resultado. Se tudo bater, o app salva sozinho.'),
        h('p', null, h('strong', { text: '3. ' }), 'Depois de algumas compras, veja Resumo e Preços.'),
        h('div', { class: 'warn', text: 'Este app está em teste: confira os valores e avise se algo vier errado (Ajustes → Enviar problema).' }),
        h('p', { class: 'mute' }, 'Suas compras ficam só neste aparelho. Ao ler uma nota, o endereço dela passa por um serviço de leitura que não guarda nada. ',
          h('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener', text: 'Política de privacidade' }), '.'),
        h('button', { class: 'primary', text: 'Entendi, começar', onclick: function () { S.seen = true; save(); tab = 'add'; render(); } })));
      return;
    }
    if (!S.purchases.length) {
      view.append(h('div', { class: 'card' },
        h('div', { class: 'big', text: 'Comece pela primeira nota' }),
        h('p', { class: 'mute', text: 'Escaneie o QR Code da nota fiscal do mercado. O app lê os itens e mostra, depois de algumas compras, o que subiu de preço e onde dá para cortar.' }),
        h('button', { class: 'primary', text: 'Adicionar nota', onclick: function () { tab = 'add'; render(); } })));
      return;
    }
    if (alertas && alertas.itens.length) {
      const ca = h('div', { class: 'card' }, h('strong', { text: 'O que ficou mais caro nesta nota' }),
        h('div', { class: 'mute', text: 'Comparado com a última vez que você comprou cada produto.' }));
      alertas.itens.slice(0, 5).forEach(function (a) {
        ca.append(h('div', { class: 'row' },
          h('div', { class: 'n' }, a.nome, h('div', { class: 'mute', text: brl(a.de) + ' → ' + brl(a.para) + ' por ' + a.rotulo + (a.suspeito ? ' · pode ser fim de promoção' : '') })),
          h('div', { class: 'v up', text: pct(a.pct) })));
      });
      if (alertas.itens.length > 5) ca.append(h('div', { class: 'mute', text: 'e mais ' + (alertas.itens.length - 5) + ' (veja em Preços).' }));
      ca.append(h('div', { style: 'margin-top:8px' }, h('button', { class: 'sm', text: 'Ok', onclick: function () { alertas = null; render(); } })));
      view.append(ca);
    }
    if (needsBackup()) {
      view.append(h('div', { class: 'card' }, h('strong', { text: 'Faça um backup' }),
        h('p', { class: 'mute', text: 'Suas notas ficam só neste celular. Se você limpar o navegador ou trocar de aparelho, elas somem. Leva 5 segundos: escolha o Drive no menu que abrir.' }),
        h('div', { class: 'flex' },
          h('button', { class: 'primary', text: 'Fazer backup', onclick: function () { exportBackup().then(function () { render(); }); } }),
          h('button', { text: 'Lembrar depois', onclick: function () { S.backupSnooze = new Date(Date.now() + 7 * DIA).toISOString(); save(); render(); } }))));
    }
    const months = Core.monthlyTotals(S.purchases);
    const last = months[months.length - 1];
    const card1 = h('div', { class: 'card' },
      h('div', { class: 'mute', text: last ? 'Gasto em ' + mesBR(last.mes) : 'Gasto' }),
      h('div', { class: 'big', text: last ? brl(last.total) : '—' }));
    const mc = Core.monthCompare(S.purchases);
    if (mc && mc.ok) {
      card1.append(h('div', { class: 'mute' },
        (mc.ate ? 'Mesmo período do mês anterior (até o dia ' + mc.ate + ' de ' + mesBR(mc.anterior.mes) + '): ' : 'Mês anterior (' + mesBR(mc.anterior.mes) + '): ') + brl(mc.anterior.total) + ' ',
        h('span', { class: mc.pct > 0 ? 'up' : 'down', text: pct(mc.pct) })));
    } else if (last) {
      card1.append(h('div', { class: 'mute', text: 'A comparação com o mês anterior aparece quando houver pelo menos 2 notas em cada mês.' }));
    }
    view.append(card1);
    view.append(goalCard());

    const inf = Core.personalInflation(S.purchases);
    const card2 = h('div', { class: 'card' }, h('div', { class: 'mute', text: 'Sua inflação do mercado' }));
    if (inf.pct == null) {
      card2.append(h('div', { class: 'big', text: '—' }), h('div', { class: 'mute', text: 'Precisa de pelo menos 3 produtos comprados em datas diferentes (' + inf.produtos + ' até agora).' }));
    } else {
      card2.append(h('div', { class: 'big ' + (inf.pct > 0 ? 'up' : 'down'), text: pct(inf.pct) }),
        h('div', { class: 'mute', text: 'Média ponderada pelo gasto, em ' + inf.produtos + ' produtos que você repetiu. Compare com o IPCA de alimentos do IBGE.' + (inf.excluidos ? ' Deixei de fora ' + inf.excluidos + (inf.excluidos === 1 ? ' produto' : ' produtos') + ' com variação acima de 40% (pode ser promoção).' : '') }));
    }
    view.append(card2);

    // corte
    const cp = Core.cutPotential(S.purchases, S.overrides, S.cutMap, S.corte);
    const card3 = h('div', { class: 'card' }, h('div', { class: 'mute', text: 'Itens que você marcou como cortáveis' }));
    if (!cp.categorias.length) {
      card3.append(h('div', { text: 'Nenhuma categoria marcada ainda. Marque em Ajustes.' }));
    } else {
      card3.append(h('div', { class: 'big', text: brl(cp.totalPeriodo) }),
        h('div', { class: 'mute', text: 'nas notas guardadas (' + cp.categorias.map(function (c) { return c.nome; }).join(', ') + ')' }));
      const sel = h('select', { 'aria-label': 'Quanto cortar' });
      [10, 20, 30, 50].forEach(function (v) { sel.append(h('option', { value: v, selected: v === S.corte }, 'Cortar ' + v + '%')); });
      sel.addEventListener('change', function () { S.corte = +sel.value; save(); render(); });
      card3.append(h('div', { style: 'margin-top:10px' }, sel));
      if (cp.poucosDados) {
        card3.append(h('p', { text: 'Se tivesse cortado ' + S.corte + '% disso, teria economizado ' + brl(cp.economiaPeriodo) + ' nessas notas.' }),
          h('div', { class: 'mute', text: 'A projeção por mês e por ano aparece depois de 4 semanas de notas (você tem ' + cp.dias + (cp.dias === 1 ? ' dia' : ' dias') + ').' }));
      } else {
        card3.append(h('p', { text: 'Se cortar ' + S.corte + '%, você economiza cerca de ' + brl(cp.economiaMensal) + ' por mês (' + brl(cp.economiaAnual) + ' por ano).' }),
          h('div', { class: 'mute', text: 'Estimativa baseada em ' + cp.dias + ' dias de notas.' }));
      }
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
    if (!proxyUrl()) msg.append(h('div', { class: 'warn', text: 'Para buscar a nota pelo endereço, configure o proxy em Ajustes. Sem ele, use o plano B (colar o texto).' }));
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
    if (!proxyUrl()) {
      const campo = view.querySelector('input[type=text]');
      if (campo) campo.value = urlMatch[0];
      msg.replaceChildren(
        h('div', { class: 'warn', text: 'QR Code lido! Sem o proxy o app não busca a nota sozinho. Faça assim: toque em "Abrir a nota", copie o texto da página, volte aqui e cole no plano B (opção 3).' }),
        h('a', { class: 'btn', href: urlMatch[0], target: '_blank', rel: 'noopener noreferrer', style: 'display:inline-block;text-decoration:none;line-height:24px', text: 'Abrir a nota' }));
      const det = view.querySelector('details'); if (det) det.open = true;
      return;
    }
    say(msg, 'Buscando a nota…');
    const ufNota = ufDaChave(chave);
    lastRead = { text: '', summary: 'buscando', uf: ufNota };
    try {
      const px = proxyUrl();
      const res = await fetch(px + (px.indexOf('?') >= 0 ? '&' : '?') + 'u=' + encodeURIComponent(urlMatch[0]));
      if (!res.ok) { lastRead.summary = 'erro HTTP ' + res.status; return say(msg, 'O site da SEFAZ respondeu com erro ' + res.status + '. Tente o plano B.' + dicaUf(ufNota), true); }
      const text = await res.text();
      handleText(text, msg, raw);
    } catch (e) {
      lastRead.summary = 'sem resposta do proxy';
      say(msg, 'Não consegui falar com o proxy. Confira o endereço em Ajustes ou use o plano B.' + dicaUf(ufNota), true);
    }
  }

  function handleText(text, msg, origem) {
    if (!String(text || '').trim()) return say(msg, 'Nada para ler.', true);
    if (/captcha|n[ãa]o sou um rob[ôo]/i.test(text) && !/Vl\.?\s*Unit|txtTit/i.test(text)) {
      return say(msg, 'O site pediu CAPTCHA. Abra a nota no navegador, resolva, copie o texto e use o plano B.', true);
    }
    const ufOrigem = ufDaChave(NFParser.extractChave(origem || '') || NFParser.extractChave(text));
    lastRead = { text: plainText(text), summary: 'lendo', uf: ufOrigem };
    let r;
    try { r = NFParser.parseAny(text); } catch (e) { lastRead.summary = 'erro: ' + e.message; return say(msg, 'Erro ao ler a nota: ' + e.message + dicaUf(ufOrigem), true); }
    if (!lastRead.uf && r.uf) lastRead.uf = r.uf;
    lastRead.summary = r.items.length + ' itens, total ' + r.total + (r.uf ? ', ' + r.uf : '') + (r.warnings.length ? ', avisos: ' + r.warnings.join(' | ') : '');
    if (!r.items.length) return say(msg, 'Não consegui achar itens nessa página. Se o texto da nota estiver na tela, use o plano B e me mande um exemplo para eu ajustar o leitor (sem CPF).' + dicaUf(lastRead.uf), true);
    if (!r.chave) { const k = NFParser.extractChave(origem); if (k) r.chave = k; }
    if (isDup(r)) return say(msg, 'Essa nota já estava salva (' + dataBR(r.date) + ', ' + brl(r.total) + ').', true);
    if (S.auto && autoOk(r)) {
      const rec = commit(r, r.date, r.store.name);
      registrarAlertas(rec);
      pending = null; tab = 'home'; render();
      toast('Nota salva: ' + rec.items.length + ' itens, ' + brl(rec.total) + ' · ' + storeLabel(rec.store), function () {
        S.purchases = S.purchases.filter(function (x) { return x.id !== rec.id; }); alertas = null; save(); render();
      });
      return;
    }
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
    const dup = isDup(r);
    const dateInp = h('input', { type: 'text', value: r.date ? dataBR(r.date) : '', placeholder: 'dd/mm/aaaa', inputmode: 'numeric' });
    const storeInp = h('input', { type: 'text', value: r.store.name || '', placeholder: 'Nome do mercado', autocomplete: 'off', 'aria-label': 'Nome da loja' });
    const card = h('div', { class: 'card' },
      h('div', { class: 'mute', text: 'Confira antes de salvar' }),
      h('div', { class: 'big', text: brl(r.total) }),
      h('label', { text: 'Nome da loja' + (r.uf ? ' (' + r.uf + ')' : '') }), storeInp,
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
        const rec = commit(r, iso, storeInp.value.trim());
        registrarAlertas(rec);
        pending = null; tab = 'home'; render();
      } })));
  }

  // ---------- Compras ----------
  let openBuy = null;
  function viewBuys() {
    if (!S.purchases.length) return view.append(h('div', { class: 'card', text: 'Nenhuma nota ainda.' }));
    // acha o produto de cada item para mostrar e corrigir a categoria
    const byItem = {};
    Core.buildProducts(S.purchases).forEach(function (pr) { pr.compras.forEach(function (c) { byItem[c.nota + '|' + c.nome] = pr; }); });
    view.append(h('div', { class: 'mute', text: 'Abaixo de cada item está a categoria dele. Toque nela para corrigir: o app lembra nas próximas notas.' }));
    S.purchases.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).forEach(function (p) {
      const d = h('details', { class: 'card', open: p.id === openBuy },
        h('summary', null, h('span', null, dataBR(p.date) + ' · ' + storeLabel(p.store) + ' · ' + brl(p.total))));
      d.addEventListener('toggle', function () { if (d.open) openBuy = p.id; else if (openBuy === p.id) openBuy = null; });
      p.items.forEach(function (it) {
        const pr = byItem[p.id + '|' + it.nome];
        const cat = pr ? (S.overrides[pr.key] || pr.categoria) : 'outros';
        const sel = h('select', { 'aria-label': 'Categoria de ' + it.nome, style: 'width:auto;max-width:100%;padding:4px 8px;font-size:13px;margin-top:4px' });
        Core.CATEGORIES.forEach(function (c) { sel.append(h('option', { value: c.id, selected: c.id === cat }, c.nome)); });
        sel.addEventListener('change', function () { if (pr) { S.overrides[pr.key] = sel.value; save(); } render(); });
        d.append(h('div', { class: 'row' }, h('div', { class: 'n' }, it.nome, h('div', null, sel)), h('div', { class: 'v', text: brl(it.vlTotal) })));
      });
      d.append(h('div', { style: 'margin-top:10px' }, h('button', { class: 'danger', text: 'Apagar esta nota', onclick: function () {
        if (confirm('Apagar esta nota?')) { S.purchases = S.purchases.filter(function (x) { return x.id !== p.id; }); save(); render(); }
      } })));
      view.append(d);
    });
  }

  // ---------- Preços ----------
  // Gráfico de linha em SVG puro: um ponto por compra, espaçados por ordem (não por dias).
  function priceChart(serie, rotulo) {
    const NS = 'http://www.w3.org/2000/svg';
    const W = 300, H = 132, PL = 8, PR = 8, PT = 24, PB = 22, FOLGA = 16; // FOLGA: espaço para o rótulo abaixo do ponto mais baixo
    const vals = serie.map(function (s) { return s.valor; });
    let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max === min) { min -= 1; max += 1; }
    const x = function (i) { return serie.length === 1 ? W / 2 : PL + i * (W - PL - PR) / (serie.length - 1); };
    const y = function (v) { return PT + (max - v) * (H - PT - PB - FOLGA) / (max - min); };
    const el = function (tag, attrs) {
      const e = document.createElementNS(NS, tag);
      Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
      return e;
    };
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: '100%', role: 'img',
      'aria-label': 'Preço por ' + rotulo + ' em ' + serie.length + ' compras, de ' + brl(vals[0]) + ' a ' + brl(vals[vals.length - 1]) });
    svg.append(el('line', { x1: PL, x2: W - PR, y1: H - PB, y2: H - PB, stroke: 'var(--line)', 'stroke-width': 1 }));
    svg.append(el('polyline', { points: serie.map(function (s, i) { return x(i) + ',' + y(s.valor); }).join(' '),
      fill: 'none', stroke: 'var(--brand)', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    // Toque (ou clique) em um ponto mostra data, preço e loja numa linha abaixo do gráfico.
    // Tooltip de <title> não aparece no celular, por isso a linha de texto.
    const info = h('div', { class: 'hist-info', 'aria-live': 'polite' });
    const pontos = [];
    const mostrar = function (i) {
      const s = serie[i];
      info.textContent = dataBR(s.data) + ' · ' + brl(s.valor) + ' por ' + rotulo + (s.loja ? ' · ' + s.loja : '');
      pontos.forEach(function (c, j) { c.setAttribute('r', j === i ? 5.5 : 3.5); });
    };
    serie.forEach(function (s, i) {
      const c = el('circle', { class: 'pt', cx: x(i), cy: y(s.valor), r: 3.5, fill: 'var(--brand)' });
      pontos.push(c); svg.append(c);
    });
    serie.forEach(function (s, i) {
      // área de toque maior e invisível, para dedo no celular
      const alvo = el('circle', { class: 'hit', cx: x(i), cy: y(s.valor), r: 16, fill: 'transparent', style: 'cursor:pointer' });
      alvo.addEventListener('click', function () { mostrar(i); });
      svg.append(alvo);
    });
    const txt = function (cx, cy, anchor, s) {
      const t = el('text', { x: cx, y: cy, 'text-anchor': anchor, 'font-size': 10, fill: 'var(--mute)' });
      t.textContent = s; return t;
    };
    const ult = serie.length - 1;
    // rótulo no lado livre: se o vizinho está acima, a linha sobe, então o rótulo vai abaixo do ponto
    const dy = function (i, viz) { return y(vals[i]) + (viz > vals[i] ? 13 : -7); };
    svg.append(txt(x(0), ult > 0 ? dy(0, vals[1]) : y(vals[0]) - 7, serie.length === 1 ? 'middle' : 'start', brl(vals[0])));
    if (ult > 0) svg.append(txt(x(ult), dy(ult, vals[ult - 1]), 'end', brl(vals[ult])));
    svg.append(txt(PL, H - 6, 'start', dataBR(serie[0].data).slice(0, 5)));
    if (ult > 0) svg.append(txt(W - PR, H - 6, 'end', dataBR(serie[ult].data).slice(0, 5)));
    mostrar(ult);
    return h('div', null, svg, info);
  }

  function viewPrices() {
    const ch = Core.priceChanges(S.purchases);
    const card = h('div', { class: 'card' }, h('h2', { text: 'O que mudou de preço' }),
      h('div', { class: 'mute', text: 'Primeiro preço comparado ao último, por kg, litro ou unidade. Produtos parecidos são agrupados pelo nome; confira se faz sentido.' }));
    if (!ch.length) card.append(h('p', { text: 'Ainda não há produtos comprados em duas datas diferentes.' }));
    ch.slice(0, 15).forEach(function (c) {
      const acoes = h('div', { class: 'flex', style: 'margin-top:6px;gap:6px' },
        h('button', { class: 'sm', text: 'Renomear', onclick: function () {
          const novo = prompt('Novo nome do produto (vazio volta ao original):', c.nome);
          if (novo === null) return;
          if (novo.trim()) S.names[c.key] = novo.trim(); else delete S.names[c.key];
          save(); render();
        } }),
        c.rawKeys.length > 1 ? h('button', { class: 'sm', text: 'Separar', onclick: function () {
          c.rawKeys.forEach(function (rk) { if (rk === c.key) return; if (S.merges[rk]) delete S.merges[rk]; else S.separate[rk] = true; });
          save(); render();
        } }) : null);
      card.append(h('div', { class: 'row' },
        h('div', { class: 'n' }, c.nome,
          h('div', { class: 'mute', text: brl(c.de) + ' → ' + brl(c.para) + ' por ' + c.rotulo }),
          c.suspeito ? h('div', { class: 'warn', style: 'margin:6px 0;padding:6px 10px;font-size:13px', text: 'Variação grande: pode ser promoção. Não entra na sua inflação.' }) : null,
          c.nomes.length > 1 ? h('div', { class: 'mute', text: 'Junta: ' + c.nomes.slice(0, 3).join(' · ') }) : null,
          c.serie && c.serie.length >= 2 ? h('details', { class: 'hist' }, h('summary', { text: 'Ver histórico (' + c.serie.length + ' compras)' }),
            priceChart(c.serie, c.rotulo),
            h('div', { class: 'mute', text: 'Cada ponto é uma compra, por ' + c.rotulo + '. Toque em um ponto para ver a data, o preço e a loja.' })) : null,
          acoes),
        h('div', { class: 'v ' + (c.pct > 0 ? 'up' : 'down'), text: pct(c.pct) })));
    });
    view.append(card);

    const unir = function (de, para) {
      de.rawKeys.forEach(function (rk) { if (Core.resolveKey(para.key) !== rk) S.merges[rk] = para.key; });
      save(); render();
    };
    const sug = Core.suggestMerges(S.purchases, 3);
    if (sug.length) {
      const cs = h('div', { class: 'card' }, h('h2', { text: 'Será que são o mesmo produto?' }),
        h('div', { class: 'mute', text: 'Se unir, o app passa a comparar o preço dos dois.' }));
      sug.forEach(function (x) {
        const menor = x.a.compras.length <= x.b.compras.length ? x.a : x.b, maior = menor === x.a ? x.b : x.a;
        cs.append(h('div', { class: 'row', style: 'display:block' },
          h('div', null, x.a.nome + ' (' + x.a.compras.length + ')'), h('div', { class: 'mute', text: 'e' }), h('div', null, x.b.nome + ' (' + x.b.compras.length + ')'),
          h('div', { class: 'flex', style: 'margin-top:8px' },
            h('button', { class: 'primary', text: 'Unir', onclick: function () { unir(menor, maior); } }),
            h('button', { text: 'Não são', onclick: function () { S.noMerge[Core.pairKey(x.a.key, x.b.key)] = true; save(); render(); } }))));
      });
      view.append(cs);
    }
    const todos = Core.buildProducts(S.purchases).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    if (todos.length > 1) {
      const selA = h('select', { 'aria-label': 'Produto a unir' }), selB = h('select', { 'aria-label': 'Unir com' });
      todos.forEach(function (pr, i) {
        const t = pr.nome + ' (' + pr.compras.length + ')';
        selA.append(h('option', { value: i }, t)); selB.append(h('option', { value: i }, t));
      });
      view.append(h('details', { class: 'card' }, h('summary', { text: 'Unir produtos manualmente' }),
        h('div', { class: 'mute', text: 'Escolha dois produtos que são o mesmo item com nomes diferentes. O primeiro passa a contar como o segundo.' }),
        h('label', { text: 'Produto' }), selA, h('label', { text: 'É o mesmo que' }), selB,
        h('div', { style: 'margin-top:10px' }, h('button', { class: 'primary', text: 'Unir', onclick: function () {
          const a = todos[+selA.value], b = todos[+selB.value];
          if (a.key === b.key) return toast('Escolha dois produtos diferentes.');
          unir(a, b);
        } }))));
    }
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
    const autoCb = h('input', { type: 'checkbox', id: 'auto', checked: S.auto });
    autoCb.addEventListener('change', function () { S.auto = autoCb.checked; save(); });
    view.append(h('div', { class: 'card' }, h('h2', { text: 'Salvar nota automaticamente' }),
      h('div', { class: 'mute', text: 'Quando a soma dos itens bate com o total e a chave confere, a nota é salva direto, com um botão Desfazer por 8 segundos. Se algo não bater, o app mostra a tela de conferência.' }),
      h('div', { class: 'row' }, h('label', { for: 'auto', style: 'margin:0;color:inherit;font-size:16px;flex:1' }, 'Salvar sem pedir confirmação'), autoCb)));

    // Avançado: fica recolhido e sem mostrar o endereço padrão
    const proxy = h('input', { type: 'url', value: S.proxy, placeholder: 'https://…workers.dev (deixe vazio para usar o padrão)', inputmode: 'url' });
    view.append(h('details', { class: 'card' }, h('summary', { text: 'Avançado: proxy de leitura' }),
      h('div', { class: 'mute', text: 'O app já vem configurado. Só preencha se você mesmo hospeda o proxy (veja o README). Vazio = usa o padrão.' }),
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

    view.append(h('div', { class: 'card' }, h('h2', { text: 'Refazer categorias' }),
      h('div', { class: 'mute', text: 'Apaga as correções de categoria que você fez à mão e deixa o app decidir de novo, com a lista mais recente de palavras.' }),
      h('div', { style: 'margin-top:10px' }, h('button', { text: 'Refazer categorias automáticas', onclick: function () {
        if (!confirm('Apagar suas correções de categoria e refazer automaticamente?')) return;
        S.overrides = {}; save(); render(); toast('Categorias refeitas.');
      } })),
      h('div', { class: 'mute', style: 'margin-top:14px', text: 'Também dá para desfazer as uniões, separações e nomes que você deu aos produtos na tela Preços.' }),
      h('div', { style: 'margin-top:8px' }, h('button', { text: 'Desfazer ajustes de produtos', onclick: function () {
        if (!confirm('Desfazer todas as uniões, separações e nomes de produtos?')) return;
        S.merges = {}; S.separate = {}; S.names = {}; S.noMerge = {}; save(); render(); toast('Ajustes de produtos desfeitos.');
      } }))));

    const obs = h('input', { type: 'text', placeholder: 'O que deu errado? (ex.: faltaram itens)', 'aria-label': 'O que deu errado' });
    const rep = h('textarea', { placeholder: 'O texto da nota aparece aqui depois da última leitura, sem CPF. Você também pode colar o texto da nota.', 'aria-label': 'Texto do relatório' });
    rep.value = lastRead ? scrubCpf(lastRead.text).slice(0, 60000) : '';
    const doShare = function () {
      const txt = buildReport(obs.value.trim(), rep.value);
      if (navigator.share) navigator.share({ title: 'Relatório Caderninho do Mercado', text: txt }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Relatório copiado.'); }, function () { alert('Não consegui copiar. Selecione o texto e copie.'); });
    };
    view.append(h('div', { class: 'card' }, h('h2', { text: 'Enviar problema' }),
      h('div', { class: 'mute', text: 'Se uma nota veio errada ou não foi lida, gere um relatório e mande para quem está testando o app com você. O app tira o CPF do texto, mas confira se não sobrou seu nome ou CPF antes de enviar.' }),
      h('div', { style: 'margin-top:8px' }, obs), h('div', { style: 'margin-top:8px' }, rep),
      h('div', { class: 'flex', style: 'margin-top:8px' },
        h('button', { class: 'primary', text: 'Compartilhar relatório', onclick: doShare }),
        h('button', { text: 'Copiar', onclick: function () {
          const txt = buildReport(obs.value.trim(), rep.value);
          if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Relatório copiado.'); }, function () { alert('Não consegui copiar.'); });
        } }))));

    view.append(h('div', { class: 'card' }, h('h2', { text: 'Sobre' }),
      h('div', { class: 'mute', text: 'Caderninho do Mercado, versão ' + VERSION + '. Em teste.' }),
      h('div', { style: 'margin-top:8px' }, h('a', { href: 'privacidade.html', target: '_blank', rel: 'noopener', text: 'Política de privacidade' }))));

    const imp = h('input', { type: 'file', accept: 'application/json', hidden: true });
    imp.addEventListener('change', function () {
      const f = imp.files[0]; if (!f) return;
      f.text().then(function (t) {
        try { const d = JSON.parse(t); if (!Array.isArray(d.purchases)) throw 0; S = Object.assign({}, defaults, d); save(); render(); alert('Dados importados.'); }
        catch (e) { alert('Arquivo inválido.'); }
      });
    });
    view.append(h('div', { class: 'card' }, h('h2', { text: 'Seus dados' }),
      h('div', { class: 'mute', text: 'Ficam só neste aparelho. Se limpar os dados do navegador ou trocar de celular, somem. Faça backup de vez em quando.' }),
      h('div', { class: 'mute', text: 'Último backup: ' + (S.lastBackup ? dataBR(S.lastBackup.slice(0, 10)) : 'nunca') }),
      h('div', { class: 'flex', style: 'margin-top:10px' },
        h('button', { class: 'primary', text: 'Fazer backup', onclick: function () { exportBackup().then(function () { render(); }); } }),
        h('button', { text: 'Importar', onclick: function () { imp.click(); } }), imp),
      h('div', { style: 'margin-top:10px' }, h('button', { class: 'danger', text: 'Apagar tudo', onclick: function () {
        if (confirm('Apagar todas as notas e ajustes deste aparelho?')) { S = Object.assign({}, defaults); save(); render(); }
      } }))));
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {});
  render();

  // Quando o app recebe um endereço pelo menu "Compartilhar" do celular
  (function fromShare() {
    try {
      const q = new URLSearchParams(location.search);
      const blob = [q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' ');
      if (!blob) return;
      history.replaceState(null, '', location.pathname);
      if (/https?:\/\//i.test(blob) || NFParser.extractChave(blob)) {
        tab = 'add'; render();
        handleInput(blob, document.getElementById('msg'));
      }
    } catch (e) { /* ignora */ }
  })();
})();
