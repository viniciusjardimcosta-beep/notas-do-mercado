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
    { id: 'limpeza', nome: 'Limpeza', cortavel: false },
    { id: 'higiene', nome: 'Higiene e beleza', cortavel: false },
    { id: 'pet', nome: 'Pet', cortavel: false },
    { id: 'outros', nome: 'Outros', cortavel: false }
  ];

  // Palavras-chave (em minúsculas, sem acento). A primeira categoria que casar vence.
  const RULES = [
    // prioridade: itens que o nome de outra categoria confundiria (ex.: "sabonete aveia", "pepino conserva")
    ['higiene', ['sabonete', 'shampoo', 'xampu', 'condicionador', 'creme dental', 'pasta de dente', 'desodorante', 'papel higienico', 'absorvente', 'fralda', 'cotonete', 'fio dental', 'hidratante']],
    ['laticinios', ['iogurte', 'beb lac', 'bebida lactea', 'creme de leite', 'leite condensado', 'requeijao']],
    ['bebidas', ['suco ', 'nectar', 'refresco']],
    ['mercearia', ['conserva', 'extremo sabor', 'paprica', 'oregano', 'colorau', 'cominho', 'pimenta', 'achoc', 'farofa', 'caldo ', 'tempero', 'molho']],
    ['refri', ['refrig', 'refri ', 'coca cola', 'coca-cola', 'guarana', 'fanta', 'sprite', 'pepsi', 'energetico', 'red bull', 'monster', 'soda ']],
    ['alcool', ['cerveja', 'vinho', 'vodka', 'whisky', 'cachaca', 'gin ', 'espumante', 'skol', 'brahma', 'heineken', 'antarctica', 'itaipava']],
    ['snacks', ['biscoito', 'bolacha', 'bisc ', 'bisc.', 'cookie', 'salgadinho', 'batata chips', 'batata palha', 'chips', 'doritos', 'ruffles', 'cheetos', 'pipoca', 'chocolate', 'bombom', 'bala ', 'balas', 'pirulito', 'chiclete', 'goma de', 'sorvete', 'wafer', 'recheado', 'trakinas', 'oreo', 'amendoim', 'doce de', 'paçoca', 'pacoca']],
    ['hortifruti', ['banana', 'maca ', 'laranja', 'limao', 'tomate', 'cebola', 'alho', 'batata', 'cenoura', 'alface', 'abobora', 'mamao', 'melancia', 'abacaxi', 'uva', 'manga', 'pepino', 'pimentao', 'repolho', 'brocolis', 'couve', 'mandioca', 'verdura', 'fruta', 'legume', ' pera ', 'morango', 'abacate', 'kiwi', 'melao', 'goiaba', 'pessego', 'ameixa', 'beterraba', 'batata rosa']],
    ['carnes', ['carne', 'frango', 'file ', 'bife', 'patinho', 'alcatra', 'acem', 'costela', 'linguica', 'salsicha', 'peixe', 'tilapia', 'sardinha', 'atum', 'bacon', 'presunto', 'ovos', 'ovo ', 'moida', 'coxa', 'sobrecoxa', 'peito de', 'paleta', 'fgo', 'filezinho', 'moela', 'hot dog', 'pernil', 'lombo', 'picanha', 'maminha', 'fraldinha', 'cupim', 'figado', 'mortadela', 'salame', 'copa ']],
    ['laticinios', ['leite', 'queijo', 'iogurte', 'manteiga', 'margarina', 'requeijao', 'creme de leite', 'nata', 'mussarela', 'muçarela', 'ricota', 'danone', 'yakult']],
    ['padaria', ['pao ', 'pao-', 'paes', 'bisnaga', 'bolo ', 'torrada', 'baguete', 'croissant']],
    ['mercearia', ['arroz', 'feijao', 'macarrao', 'espaguete', 'farinha', 'acucar', 'sal ', 'oleo', 'azeite', 'cafe', 'molho', 'extrato', 'milho', 'ervilha', 'fuba', 'aveia', 'tempero', 'vinagre', 'maionese', 'ketchup', 'lentilha', 'grao', 'cereal']],
    ['bebidas', ['agua', 'suco', 'cha ', 'cha-', 'leite de coco', 'isotonico', 'gatorade']],
    ['prontos', ['pizza', 'lasanha', 'nugget', 'empanado', 'hamburguer', 'congelad', 'pao de queijo', 'miojo', 'lamen', 'sopa']],
    ['limpeza', ['detergente', 'sabao', 'amaciante', 'desinfetante', 'agua sanitaria', 'cloro', 'limpador', 'esponja', 'multiuso', 'saco de lixo', 'papel toalha', 'lava ', 'veja ', 'omo ', 'ype']],
    ['higiene', ['shampoo', 'xampu', 'condicionador', 'sabonete', 'creme dental', 'pasta de dente', 'escova', 'desodorante', 'papel higienico', 'absorvente', 'fralda', 'cotonete', 'fio dental', 'hidratante', 'barbear']],
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

  function buildProducts(purchases) {
    const products = [];
    const byGtin = {}, byKey = {};
    purchases.forEach(function (p) {
      p.items.forEach(function (it) {
        const n = normalizeName(it.nome);
        let prod = null;
        if (looksLikeGtin(it.codigo) && byGtin[it.codigo]) prod = byGtin[it.codigo];
        if (!prod && byKey[n.key]) prod = byKey[n.key];
        if (!prod) {
          for (let i = 0; i < products.length; i++) {
            const c = products[i];
            const sameSize = (!c.size && !n.size) || (c.size && n.size && c.size.valor === n.size.valor && c.size.unidade === n.size.unidade);
            if (sameSize && similarity(c.words, n.words) >= 0.8) { prod = c; break; }
          }
        }
        if (!prod) {
          prod = { id: 'p' + products.length, nome: it.nome, key: n.key, words: n.words, size: n.size, categoria: categorize(it.nome), compras: [] };
          products.push(prod);
        }
        if (looksLikeGtin(it.codigo)) byGtin[it.codigo] = prod;
        byKey[n.key] = prod;
        prod.compras.push({
          data: p.date, loja: (p.store && p.store.name) || '', cnpj: (p.store && p.store.cnpj) || '',
          qtd: it.qtd, un: it.un, vlUnit: it.vlUnit, vlTotal: it.vlTotal, nota: p.id, nome: it.nome
        });
      });
    });
    products.forEach(function (pr) {
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
      out.push({
        id: pr.id, nome: pr.nome, rotulo: a.rotulo, de: a.valor, para: b.valor, pct: pct,
        dataDe: first.data, dataPara: last.data, lojaDe: first.loja, lojaPara: last.loja, categoria: pr.categoria,
        compras: pr.compras.length
      });
    });
    return out.sort(function (a, b) { return b.pct - a.pct; });
  }

  // Inflação pessoal: média ponderada pelo gasto (primeira compra) dos produtos que você comprou 2+ vezes.
  function personalInflation(purchases) {
    const ch = priceChanges(purchases);
    let wsum = 0, acc = 0, n = 0;
    const products = {};
    buildProducts(purchases).forEach(function (p) { products[p.id] = p; });
    ch.forEach(function (c) {
      const pr = products[c.id];
      const w = pr.compras[0].vlTotal;
      acc += c.pct * w; wsum += w; n++;
    });
    if (n < 3) return { pct: null, produtos: n };
    return { pct: acc / wsum, produtos: n };
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
    priceChanges: priceChanges, personalInflation: personalInflation, storeCompare: storeCompare, cutPotential: cutPotential
  };
});
