/* core.js — normalização de produtos, categorias e análises.
 * Sem dependência de DOM. Roda no navegador (window.Core) e no Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Categorias padrão. "cortavel" é só um valor inicial: o usuário decide.
  const CATEGORIES = [
    { id: 'hortifruti', nome: 'Hortifrúti', cortavel: false },
    { id: 'carnes', nome: 'Carnes e ovos', cortavel: false },
    { id: 'laticinios', nome: 'Laticínios e frios', cortavel: false },
    { id: 'mercearia', nome: 'Mercearia básica', cortavel: false },
    { id: 'padaria', nome: 'Padaria', cortavel: false },
    { id: 'bebidas', nome: 'Bebidas', cortavel: false },
    { id: 'snacks', nome: 'Biscoitos, salgadinhos e doces', cortavel: true },
    { id: 'refri', nome: 'Refrigerantes e energéticos', cortavel: true },
    { id: 'alcool', nome: 'Bebidas alcoólicas', cortavel: true },
    { id: 'prontos', nome: 'Congelados e prontos', cortavel: false },
    { id: 'limpeza', nome: 'Limpeza e casa', cortavel: false },
    { id: 'higiene', nome: 'Higiene e beleza', cortavel: false },
    { id: 'pet', nome: 'Pet', cortavel: false },
    { id: 'outros', nome: 'Outros', cortavel: false }
  ];

  // Palavras-chave (em minúsculas, sem acento). A primeira categoria que casar vence.
  const RULES = [
    // PRIORIDADE: itens que o nome de outra categoria confundiria (ex.: "sabonete aveia", "agua sanitaria", "massa c/ovos")
    ['higiene', ['sabonete', 'shampoo', 'xampu', 'condicionador', 'creme dental', 'pasta de dente', 'escova dental', 'enxaguante', 'listerine', 'desodorante', 'papel higienico', 'absorvente', 'fralda', 'cotonete', 'fio dental', 'hidratante', 'protetor solar', 'lenco umedecido', 'talco', 'esmalte', 'acetona', 'perfume', 'colonia', 'aparelho de barbear', 'barbear']],
    ['limpeza', ['agua sanitaria', 'alvejante', 'desinfetante', 'detergente', 'amaciante', 'sabao', 'lava roupas', 'lava loucas', 'lava-roupas', 'tira manchas', 'tira-manchas', 'limpador', 'multiuso', 'esponja', 'bucha', 'saco de lixo', 'papel toalha', 'papel aluminio', 'filme pvc', 'inseticida', 'repelente', 'vassoura', 'rodo ', 'pano de', 'luva ', 'fosforo', 'vela ', 'sifao', 'guardanapo', 'cloro']],
    ['laticinios', ['iogurte', 'beb lac', 'bebida lactea', 'creme de leite', 'leite condensado', 'leite em po', 'requeijao', 'coalhada', 'chantilly', 'cream cheese', 'petit suisse']],
    ['bebidas', ['suco ', 'nectar', 'refresco', 'agua mineral', 'agua de coco', 'isotonico', 'gatorade', 'cha pronto']],
    ['mercearia', ['conserva', 'extremo sabor', 'paprica', 'oregano', 'colorau', 'cominho', 'pimenta ', 'pimenta-', 'achoc', 'farofa', 'caldo ', 'tempero', 'molho', 'massa ', 'talharim', 'macarrao', 'espaguete', 'fermento', 'sagu', 'tapioca', 'maisena', 'amido', 'granola', 'geleia', 'mel ', 'proteina de soja']],
    ['refri', ['refrig', 'refri ', 'coca cola', 'coca-cola', 'guarana', 'fanta', 'sprite', 'pepsi', 'energetico', 'red bull', 'monster', 'soda ', 'tonica', 'schweppes', 'kuat', 'h2oh']],
    ['alcool', ['cerveja', 'chopp', 'long neck', 'pilsen', 'lager', 'vinho', 'vodka', 'whisky', 'cachaca', 'gin ', 'espumante', 'licor', 'conhaque', 'tequila', 'campari', 'aperol', 'skol', 'brahma', 'heineken', 'antarctica', 'itaipava']],
    ['snacks', ['biscoito', 'bolacha', 'bisc ', 'bisc.', 'cookie', 'salgadinho', 'salg ', 'palitinho', 'batata chips', 'batata palha', 'chips', 'doritos', 'ruffles', 'cheetos', 'pipoca', 'chocolate', 'bombom', 'brigadeiro', 'bala ', 'balas', 'pirulito', 'chiclete', 'goma de', 'sorvete', 'picole', 'wafer', 'recheado', 'trakinas', 'oreo', 'amendoim', 'doce de', 'pacoca', 'paçoca', 'barra de cereal', 'pao de mel', 'panetone']],
    ['hortifruti', ['banana', 'maca ', 'laranja', 'limao', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'alface', 'abobora', 'abobrinha', 'chuchu', 'vagem', 'mamao', 'melancia', 'melao', 'abacaxi', 'abacate', 'uva', 'manga', 'pepino', 'pimentao', 'repolho', 'brocolis', 'couve', 'mandioca', 'inhame', 'beterraba', 'espinafre', 'rucula', 'agriao', 'coentro', 'cheiro verde', 'gengibre', 'tangerina', 'mexerica', 'ponkan', 'caqui', 'figo', 'verdura', 'fruta', 'legume', ' pera ', 'morango', 'kiwi', 'goiaba', 'pessego', 'ameixa']],
    ['carnes', ['carne', 'carre', 'chuleta', 'suin', 'bovin', 'frango', 'fgo', 'file ', 'filezinho', 'bife', 'steak', 'patinho', 'alcatra', 'acem', 'costela', 'costelinha', 'cost def', 'cost ', 'linguica', 'salsicha', 'salsichao', 'hot dog', 'peixe', 'tilapia', 'sardinha', 'atum', 'bacon', 'presunto', 'mortadela', 'salame', 'ovos', 'ovo ', 'moida', 'moela', 'coxa', 'sobrecoxa', 'peito de', 'paleta', 'pernil', 'lombo', 'picanha', 'maminha', 'fraldinha', 'cupim', 'figado', 'bisteca', 'kafta', 'churrasco', 'peru ', 'chester', 'tender', 'copa ']],
    ['laticinios', ['leite', 'queijo', 'manteiga', 'margarina', 'nata', 'mussarela', 'muçarela', 'ricota', 'parmesao', 'provolone', 'danone', 'yakult']],
    ['padaria', ['pao ', 'pao-', 'paes', 'bisnaga', 'bolo ', 'torrada', 'baguete', 'croissant', 'rosca', 'cuca', 'sonho', 'broa']],
    ['mercearia', ['arroz', 'feijao', 'farinha', 'acucar', 'sal ', 'oleo', 'azeite', 'cafe', 'extrato', 'milho', 'ervilha', 'fuba', 'aveia', 'vinagre', 'maionese', 'ketchup', 'lentilha', 'grao', 'cereal', 'gelatina', 'pudim']],
    ['bebidas', ['agua', 'suco', 'cha ', 'cha-']],
    ['prontos', ['pizza', 'lasanha', 'nugget', 'empanado', 'hamburguer', 'congelad', 'pao de queijo', 'miojo', 'lamen', 'sopa', 'kibe', 'coxinha', 'almondega']],
    ['pet', ['racao', 'petisco', 'areia sanitaria', 'sache gato', 'sache cao']]
  ];

  function strip(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function categorize(nome) {
    const t = ' ' + strip(nome) + ' ';
    for (let i = 0; i < RULES.length; i++) {
      const words = RULES[i][1];
      for (let j = 0; j < words.length; j++) {
        if (t.indexOf(words[j]) >= 0) return RULES[i][0];
      }
    }
    return 'outros';
  }

  // ---------- normalização de nome ----------
  const ABBR = {
    'bisc': 'biscoito', 'bsc': 'biscoito', 'rec': 'recheado', 'rech': 'recheado', 'ref': 'refrigerante', 'refrig': 'refrigerante',
    'choc': 'chocolate', 'cx': 'caixa', 'pct': 'pacote', 'pc': 'pacote', 'lt': 'litro', 'ltr': 'litro', 'lts': 'litro',
    'tp': 'tipo', 'integ': 'integral', 'desn': 'desnatado', 'sab': 'sabao', 'det': 'detergente', 'amac': 'amaciante',
    'mac': 'macarrao', 'esp': 'espaguete', 'qj': 'queijo', 'queij': 'queijo', 'marg': 'margarina', 'ach': 'achocolatado',
    'cr': 'creme', 'extr': 'extrato', 'tom': 'tomate', 'sup': 'super', 'ad': 'adulto', 'fgo': 'frango', 'cong': 'congelado',
    'pao': 'pao', 'fr': 'frango', 'lj': 'laranja', 'la': 'la', 'tr': 'tradicional', 'trad': 'tradicional'
  };

  // Extrai tamanho (ex.: 140g, 2l, 1,5l, 500 ml) e devolve {valor, unidade} em g ou ml.
  function parseSize(nome) {
    const t = strip(nome).replace(/,/g, '.');
    let m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kgs)\b/);
    if (m) return { valor: parseFloat(m[1]) * 1000, unidade: 'g' };
    m = t.match(/(\d+(?:\.\d+)?)\s*(g|gr|grs|gramas?)\b/);
    if (m) return { valor: parseFloat(m[1]), unidade: 'g' };
    m = t.match(/(\d+(?:\.\d+)?)\s*(l|lt|lts|litros?)\b/);
    if (m) return { valor: parseFloat(m[1]) * 1000, unidade: 'ml' };
    m = t.match(/(\d+(?:\.\d+)?)\s*(ml)\b/);
    if (m) return { valor: parseFloat(m[1]), unidade: 'ml' };
    return null;
  }

  function normalizeName(nome) {
    let t = strip(nome);
    t = t.replace(/[^a-z0-9.,\s]/g, ' ').replace(/(\d)[.,](\d)/g, '$1.$2');
    const size = parseSize(nome);
    // remove o tamanho do nome para a chave
    t = t.replace(/\b\d+(?:\.\d+)?\s*(kg|kgs|g|gr|grs|gramas?|l|lt|lts|litros?|ml)\b/g, ' ');
    const words = t.split(/\s+/).filter(Boolean).map(function (w) { return ABBR[w] || w; });
    // ordena as palavras para "biscoito recheado X" = "X biscoito recheado"
    const uniq = Array.from(new Set(words.filter(function (w) { return w.length > 1 || /\d/.test(w); }))).sort();
    return { key: uniq.join(' ') + (size ? '|' + size.valor + size.unidade : ''), size: size, words: uniq };
  }

  function similarity(a, b) {
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    A.forEach(function (w) { if (B.has(w)) inter++; });
    const union = A.size + B.size - inter;
    return union ? inter / union : 0;
  }

  // Agrupa itens em produtos: mesmo código de barras (se parecer GTIN) ou nome normalizado parecido.
  function looksLikeGtin(code) { return /^\d{8}$|^\d{12,14}$/.test(code || ''); }

  // Ajustes do usuário sobre o agrupamento de produtos (guardados no aparelho pelo app).
  let USER = { merges: {}, separate: {}, names: {}, noMerge: {} };
  function configure(c) {
    c = c || {};
    USER = { merges: c.merges || {}, separate: c.separate || {}, names: c.names || {}, noMerge: c.noMerge || {} };
  }
  function resolveKey(k) { let n = 0; while (USER.merges[k] && n++ < 5) k = USER.merges[k]; return k; }
  function pairKey(a, b) { return [a, b].sort().join('|'); }

  function buildProducts(purchases) {
    const products = [];
    const byGtin = {}, byKey = {};
    purchases.forEach(function (p) {
      p.items.forEach(function (it) {
        const n = normalizeName(it.nome);
        const alvo = resolveKey(n.key);
        const unido = alvo !== n.key;                      // o usuário uniu este nome a outro produto
        const separado = !unido && !!USER.separate[n.key]; // o usuário pediu para não agrupar
        const chaveGrupo = unido ? alvo : (separado ? n.key + '#sep' : n.key);
        let prod = null;
        if (unido || separado) prod = byKey[chaveGrupo] || null;
        if (!unido && !separado && looksLikeGtin(it.codigo) && byGtin[it.codigo]) prod = byGtin[it.codigo];
        if (!unido && !separado && !prod && byKey[n.key]) prod = byKey[n.key];
        if (!unido && !separado && !prod) {
          for (let i = 0; i < products.length; i++) {
            const c = products[i];
            const sameSize = (!c.size && !n.size) || (c.size && n.size && c.size.valor === n.size.valor && c.size.unidade === n.size.unidade);
            if (sameSize && similarity(c.words, n.words) >= 0.8) { prod = c; break; }
          }
        }
        if (!prod) {
          prod = { id: 'p' + products.length, nome: it.nome, key: chaveGrupo, words: n.words, size: n.size, categoria: categorize(it.nome), compras: [], rawKeys: [], nomes: [] };
          products.push(prod);
        }
        if (!separado && looksLikeGtin(it.codigo)) byGtin[it.codigo] = prod;
        byKey[chaveGrupo] = prod;
        if (prod.rawKeys.indexOf(n.key) < 0) prod.rawKeys.push(n.key);
        if (prod.nomes.indexOf(it.nome) < 0) prod.nomes.push(it.nome);
        prod.compras.push({
          data: p.date, loja: (p.store && p.store.name) || '', cnpj: (p.store && p.store.cnpj) || '',
          qtd: it.qtd, un: it.un, vlUnit: it.vlUnit, vlTotal: it.vlTotal, nota: p.id, nome: it.nome
        });
      });
    });
    products.forEach(function (pr) {
      if (USER.names[pr.key]) pr.nome = USER.names[pr.key];
      pr.compras.sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
    });
    return products;
  }

  // Preço comparável: por kg/litro quando o tamanho é conhecido, senão por unidade.
  function unitPrice(prod, compra) {
    if (prod.size && prod.size.valor) {
      const perBase = compra.vlUnit / prod.size.valor; // R$ por g ou ml
      return { valor: perBase * 1000, rotulo: prod.size.unidade === 'g' ? 'kg' : 'litro' };
    }
    return { valor: compra.vlUnit, rotulo: compra.un === 'KG' ? 'kg' : 'un' };
  }

  // ---------- análises ----------
  function monthKey(d) { return String(d || '').slice(0, 7); }

  function categoryTotals(purchases, overrides, cutMap) {
    const products = buildProducts(purchases);
    const totals = {};
    CATEGORIES.forEach(function (c) { totals[c.id] = { id: c.id, nome: c.nome, total: 0, itens: 0 }; });
    products.forEach(function (pr) {
      const cat = (overrides && overrides[pr.key]) || pr.categoria;
      pr.compras.forEach(function (c) {
        const t = totals[cat] || totals.outros;
        t.total += c.vlTotal; t.itens += 1;
      });
    });
    const list = Object.keys(totals).map(function (k) {
      const t = totals[k];
      const cat = CATEGORIES.filter(function (c) { return c.id === k; })[0];
      t.cortavel = cutMap && k in cutMap ? !!cutMap[k] : !!(cat && cat.cortavel);
      t.total = Math.round(t.total * 100) / 100;
      return t;
    }).filter(function (t) { return t.itens > 0; }).sort(function (a, b) { return b.total - a.total; });
    return list;
  }

  function monthlyTotals(purchases) {
    const m = {};
    purchases.forEach(function (p) {
      const k = monthKey(p.date);
      if (!k) return;
      m[k] = (m[k] || 0) + p.total;
    });
    return Object.keys(m).sort().map(function (k) { return { mes: k, total: Math.round(m[k] * 100) / 100 }; });
  }

  // Pares de produtos parecidos demais para ignorar e diferentes demais para o app juntar sozinho.
  function suggestMerges(purchases, limit) {
    const prods = buildProducts(purchases);
    const out = [];
    for (let i = 0; i < prods.length; i++) {
      for (let j = i + 1; j < prods.length; j++) {
        const a = prods[i], b = prods[j];
        const sameSize = (!a.size && !b.size) || (a.size && b.size && a.size.valor === b.size.valor && a.size.unidade === b.size.unidade);
        if (!sameSize || a.categoria !== b.categoria) continue;
        if (USER.noMerge[pairKey(a.key, b.key)]) continue;
        const sim = similarity(a.words, b.words);
        // só quando um nome contém todas as palavras do outro (ex.: "LEITE INTEGRAL PARMALAT" e "LEITE INTEGRAL").
        // Sabores ou variações diferentes (cada um com uma palavra própria) não são sugeridos.
        const menor = a.words.length <= b.words.length ? a.words : b.words, maior = menor === a.words ? b.words : a.words;
        const contido = menor.every(function (w) { return maior.indexOf(w) >= 0; });
        if (contido && sim >= 0.5 && sim < 1) out.push({ a: a, b: b, sim: sim });
      }
    }
    out.sort(function (x, y) { return y.sim - x.sim; });
    return out.slice(0, limit || 3);
  }

  // Compara o mês atual com o anterior de forma justa: mesmo período (até o mesmo dia) quando o mês ainda está em andamento,
  // e só quando há pelo menos 2 notas em cada lado.
  function monthCompare(purchases, now) {
    now = now || new Date();
    const datas = purchases.map(function (p) { return monthKey(p.date); }).filter(Boolean).sort();
    if (!datas.length) return null;
    const cur = datas[datas.length - 1];
    const y = +cur.slice(0, 4), m = +cur.slice(5, 7);
    const prev = m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
    const emAndamento = cur === now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const ate = emAndamento ? now.getDate() : 31;
    const soma = function (mes, limite) {
      let total = 0, notas = 0;
      purchases.forEach(function (p) {
        if (monthKey(p.date) !== mes) return;
        if (+String(p.date).slice(8, 10) > limite) return;
        total += p.total; notas++;
      });
      return { mes: mes, total: Math.round(total * 100) / 100, notas: notas };
    };
    const atual = soma(cur, 31), anterior = soma(prev, ate);
    const ok = atual.notas >= 2 && anterior.notas >= 2 && anterior.total > 0;
    return { atual: atual, anterior: anterior, ate: emAndamento ? ate : null, ok: ok, pct: ok ? (atual.total - anterior.total) / anterior.total * 100 : null };
  }

  // Variações acima disso provavelmente são promoção (ou produto diferente) e não entram na inflação pessoal.
  const LIMITE_SUSPEITO = 40;

  // Variação de preço por produto: primeiro vs último preço comparável, com pelo menos 2 compras em datas diferentes.
  function priceChanges(purchases) {
    const out = [];
    buildProducts(purchases).forEach(function (pr) {
      if (pr.compras.length < 2) return;
      const first = pr.compras[0], last = pr.compras[pr.compras.length - 1];
      if (!first.data || !last.data || first.data === last.data) return;
      const a = unitPrice(pr, first), b = unitPrice(pr, last);
      if (!a.valor || !b.valor) return;
      const pct = (b.valor - a.valor) / a.valor * 100;
      // histórico completo, para o gráfico: uma linha por compra, na mesma unidade
      const serie = [];
      pr.compras.forEach(function (c) {
        const u = unitPrice(pr, c);
        if (c.data && u.valor && isFinite(u.valor)) serie.push({ data: c.data, valor: u.valor, loja: c.loja });
      });
      out.push({
        id: pr.id, key: pr.key, rawKeys: pr.rawKeys, nomes: pr.nomes, nome: pr.nome, rotulo: a.rotulo, de: a.valor, para: b.valor, pct: pct, serie: serie,
        dataDe: first.data, dataPara: last.data, lojaDe: first.loja, lojaPara: last.loja, categoria: pr.categoria,
        compras: pr.compras.length, suspeito: Math.abs(pct) >= LIMITE_SUSPEITO
      });
    });
    // variações normais primeiro; as suspeitas (possível promoção) vão para o fim
    return out.sort(function (a, b) { if (a.suspeito !== b.suspeito) return a.suspeito ? 1 : -1; return b.pct - a.pct; });
  }

  // Itens da nota recém-salva que ficaram mais caros que a compra anterior do mesmo produto.
  function priceAlerts(purchases, notaId, minPct) {
    minPct = minPct == null ? 10 : minPct;
    const out = [];
    buildProducts(purchases).forEach(function (pr) {
      const atuais = pr.compras.filter(function (c) { return c.nota === notaId; });
      const atual = atuais[atuais.length - 1];
      if (!atual || !atual.data) return;
      const anteriores = pr.compras.filter(function (c) { return c.nota !== notaId && c.data && c.data <= atual.data; });
      const antes = anteriores[anteriores.length - 1];
      if (!antes) return;
      const a = unitPrice(pr, antes), b = unitPrice(pr, atual);
      if (!a.valor || !b.valor) return;
      const pct = (b.valor - a.valor) / a.valor * 100;
      if (pct < minPct) return;
      out.push({ nome: pr.nome, de: a.valor, para: b.valor, rotulo: a.rotulo, pct: pct, dataDe: antes.data, suspeito: pct >= LIMITE_SUSPEITO });
    });
    return out.sort(function (x, y) { return y.pct - x.pct; });
  }

  // Inflação pessoal: média ponderada pelo gasto (primeira compra) dos produtos que você comprou 2+ vezes.
  function personalInflation(purchases) {
    const todas = priceChanges(purchases);
    const ch = todas.filter(function (c) { return !c.suspeito; });
    const excluidos = todas.length - ch.length;
    let wsum = 0, acc = 0, n = 0;
    const products = {};
    buildProducts(purchases).forEach(function (p) { products[p.id] = p; });
    ch.forEach(function (c) {
      const pr = products[c.id];
      const w = pr.compras[0].vlTotal;
      acc += c.pct * w; wsum += w; n++;
    });
    if (n < 3) return { pct: null, produtos: n, excluidos: excluidos };
    return { pct: acc / wsum, produtos: n, excluidos: excluidos };
  }

  // Onde está mais barato: último preço por loja de cada produto comprado em 2+ lojas.
  function storeCompare(purchases) {
    const out = [];
    buildProducts(purchases).forEach(function (pr) {
      const byStore = {};
      pr.compras.forEach(function (c) {
        const k = c.cnpj || c.loja;
        if (!k) return;
        byStore[k] = { loja: c.loja || k, preco: unitPrice(pr, c), data: c.data };
      });
      const lojas = Object.keys(byStore).map(function (k) { return byStore[k]; });
      if (lojas.length < 2) return;
      lojas.sort(function (a, b) { return a.preco.valor - b.preco.valor; });
      const cheap = lojas[0], dear = lojas[lojas.length - 1];
      const diff = (dear.preco.valor - cheap.preco.valor) / dear.preco.valor * 100;
      out.push({ nome: pr.nome, rotulo: cheap.preco.rotulo, barata: cheap, cara: dear, economiaPct: diff });
    });
    return out.sort(function (a, b) { return b.economiaPct - a.economiaPct; });
  }

  // Quanto o usuário gasta nas categorias que marcou como "cortáveis" e o que isso daria em um ano.
  function cutPotential(purchases, overrides, cutMap, corte) {
    const cats = categoryTotals(purchases, overrides, cutMap).filter(function (c) { return c.cortavel; });
    const dates = purchases.map(function (p) { return p.date; }).filter(Boolean).sort();
    let dias = 1;
    if (dates.length >= 2) {
      const a = new Date(dates[0] + 'T00:00:00'), b = new Date(dates[dates.length - 1] + 'T00:00:00');
      dias = Math.max(1, Math.round((b - a) / 86400000) + 1);
    }
    const total = cats.reduce(function (s, c) { return s + c.total; }, 0);
    // Só projeta mês/ano com pelo menos 4 semanas de notas; antes disso a conta seria chute.
    const poucosDados = dias < 28;
    const anual = poucosDados ? null : total / dias * 365 * (corte / 100);
    return {
      categorias: cats, totalPeriodo: total, dias: dias, corte: corte, poucosDados: poucosDados,
      economiaPeriodo: total * (corte / 100), economiaAnual: anual, economiaMensal: anual == null ? null : anual / 12
    };
  }

  return {
    CATEGORIES: CATEGORIES, categorize: categorize, normalizeName: normalizeName, parseSize: parseSize,
    buildProducts: buildProducts, unitPrice: unitPrice, categoryTotals: categoryTotals, monthlyTotals: monthlyTotals,
    priceChanges: priceChanges, personalInflation: personalInflation, storeCompare: storeCompare, cutPotential: cutPotential,
    priceAlerts: priceAlerts, configure: configure, resolveKey: resolveKey, pairKey: pairKey, suggestMerges: suggestMerges, monthCompare: monthCompare
  };
});
