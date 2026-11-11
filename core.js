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

  // Cache do agrupamento de produtos (é a parte mais cara). A chave é uma assinatura do CONTEÚDO das notas
  // e dos ajustes do usuário, não um aviso manual de "mudou": se qualquer nota, item ou ajuste for diferente,
  // a assinatura muda e o cálculo é refeito. Devolve uma cópia do array para quem ordenar não bagunçar o cache.
  const CACHE_MAX = 4;
  let CACHE_KEYS = [], CACHE_VALS = {};
  function assinatura(purchases) {
    let h1 = 5381, h2 = 52711;
    const add = function (s) {
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = (Math.imul(h1, 33) ^ c) | 0; h2 = (Math.imul(h2, 31) + c) | 0; }
    };
    add(JSON.stringify(USER));
    purchases.forEach(function (p) {
      add('#' + p.id + '|' + p.date + '|' + p.total + '|' + (p.store ? p.store.cnpj + '|' + p.store.name : ''));
      (p.items || []).forEach(function (it) { add('~' + it.nome + '|' + it.codigo + '|' + it.vlUnit + '|' + it.vlTotal + '|' + it.qtd + '|' + it.un); });
    });
    return h1 + ':' + h2 + ':' + purchases.length;
  }
  function buildProducts(purchases) {
    const k = assinatura(purchases);
    if (!CACHE_VALS[k]) {
      CACHE_VALS[k] = buildProductsRaw(purchases);
      CACHE_KEYS.push(k);
      while (CACHE_KEYS.length > CACHE_MAX) delete CACHE_VALS[CACHE_KEYS.shift()];
    }
    return CACHE_VALS[k].slice();
  }

  function buildProductsRaw(purchases) {
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
  // O tamanho vem do nome de cada compra (a embalagem pode ter mudado entre uma compra e outra);
  // se o nome daquela compra não traz tamanho, usa o do produto.
  function unitPrice(prod, compra) {
    const sz = (compra.nome && parseSize(compra.nome)) || prod.size;
    if (sz && sz.valor) {
      const perBase = compra.vlUnit / sz.valor; // R$ por g ou ml
      return { valor: perBase * 1000, rotulo: sz.unidade === 'g' ? 'kg' : 'litro' };
    }
    return { valor: compra.vlUnit, rotulo: compra.un === 'KG' ? 'kg' : 'un' };
  }

  // ---------- análises ----------
  function monthKey(d) { return String(d || '').slice(0, 7); }

  function categoryTotals(purchases, overrides, cutMap, mes) {
    // sem mês: mesma janela de 12 meses do resto do app, para os números do Resumo baterem entre si.
    // com mês (AAAA-MM): só as notas daquele mês, sem janela.
    const base = mes ? purchases.filter(function (p) { return monthKey(p.date) === mes; }) : windowPurchases(purchases);
    const products = buildProducts(base);
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

  // Janela de análise: só as notas dos últimos 12 meses, contados a partir da nota mais recente (não da data de
  // hoje, para não depender do relógio nem esvaziar a tela de quem ficou um tempo sem lançar). Sem isso, anos de
  // histórico viram uma "inflação" acumulada que não dá para comparar com o IPCA de 12 meses.
  const JANELA_MESES = 12;
  function windowPurchases(purchases, meses) {
    const datas = purchases.map(function (p) { return p.date; }).filter(Boolean).sort();
    if (!datas.length) return purchases;
    const fim = datas[datas.length - 1];
    const corte = (+fim.slice(0, 4) - Math.floor((meses || JANELA_MESES) / 12)) + fim.slice(4, 10);
    const dentro = purchases.filter(function (p) { return p.date && p.date > corte; });
    return dentro.length === purchases.length ? purchases : dentro;
  }

  // Variação de preço por produto: primeiro vs último preço comparável, com pelo menos 2 compras em datas diferentes.
  // Considera só os últimos 12 meses de notas (veja windowPurchases).
  function priceChanges(purchases, opts) {
    purchases = (opts && opts.tudo) ? purchases : windowPurchases(purchases);
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
    const W = windowPurchases(purchases);
    const todas = priceChanges(W, { tudo: true });
    const ch = todas.filter(function (c) { return !c.suspeito; });
    const excluidos = todas.length - ch.length;
    let wsum = 0, acc = 0, n = 0;
    const products = {};
    buildProducts(W).forEach(function (p) { products[p.id] = p; });
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
    buildProducts(windowPurchases(purchases)).forEach(function (pr) {
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
    purchases = windowPurchases(purchases);
    const cats =categoryTotals(purchases, overrides, cutMap).filter(function (c) { return c.cortavel; });
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

  // "Embalagem menor, preço por kg maior": mesmo nome de produto (sem o tamanho) e mesma unidade,
  // onde a compra mais recente tem de 3% a 30% menos conteúdo que uma compra anterior e o preço por
  // kg/litro subiu pelo menos 3%. Não avisa se o tamanho menor já tinha sido comprado antes (os dois
  // tamanhos provavelmente existem juntos nas prateleiras). Pode errar: o texto na tela é cauteloso.
  const ENCOLHEU_MIN = 3, ENCOLHEU_MAX = 30, ENCOLHEU_KG_MIN = 3;
  function shrinkAlerts(purchases) {
    const grupos = {};
    buildProducts(purchases).forEach(function (pr) {
      pr.compras.forEach(function (c) {
        if (!c.data || !(c.vlUnit > 0)) return;
        const n = normalizeName(c.nome);
        if (!n.size || !n.words.length) return;
        const k = n.words.join(' ') + '|' + n.size.unidade;
        (grupos[k] = grupos[k] || []).push({ nome: c.nome, size: n.size.valor, unidade: n.size.unidade, data: c.data, vlUnit: c.vlUnit, loja: c.loja, nota: c.nota });
      });
    });
    const out = [];
    Object.keys(grupos).forEach(function (k) {
      const L = grupos[k].sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
      if (L.length < 2) return;
      const B = L[L.length - 1];
      const antes = L.filter(function (x) { return x.data < B.data; });
      if (!antes.length) return;
      if (antes.some(function (x) { return Math.abs(x.size - B.size) / B.size < 0.01; })) return; // o tamanho menor já existia antes
      let A = null;
      for (let i = antes.length - 1; i >= 0; i--) {
        const enc = (1 - B.size / antes[i].size) * 100;
        if (enc >= ENCOLHEU_MIN && enc <= ENCOLHEU_MAX) { A = antes[i]; break; }
      }
      if (!A) return;
      const kg0 = A.vlUnit / A.size * 1000, kg1 = B.vlUnit / B.size * 1000;
      const pctKg = (kg1 - kg0) / kg0 * 100;
      if (pctKg < ENCOLHEU_KG_MIN) return;
      out.push({
        nome: B.nome, rotulo: B.unidade === 'g' ? 'kg' : 'litro', unidade: B.unidade,
        de: { size: A.size, vlUnit: A.vlUnit, data: A.data, loja: A.loja, porKg: kg0 }, para: { size: B.size, vlUnit: B.vlUnit, data: B.data, loja: B.loja, porKg: kg1 },
        encolheuPct: (1 - B.size / A.size) * 100, pctEmbalagem: (B.vlUnit - A.vlUnit) / A.vlUnit * 100, pctKg: pctKg
      });
    });
    return out.sort(function (a, b) { return b.pctKg - a.pctKg; });
  }

  // Lista de compras: produtos que você já repetiu (2+ datas diferentes), com o intervalo médio entre
  // compras. "Acabando" = já passou 80% do intervalo médio desde a última compra. `fora` esconde itens.
  function dayNum(iso) { const p = String(iso).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5; }
  function shoppingList(purchases, now, fora) {
    now = now || new Date();
    fora = fora || {};
    const hoje = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 864e5;
    const out = [];
    buildProducts(purchases).forEach(function (pr) {
      if (fora[pr.key]) return;
      const porData = {};
      pr.compras.forEach(function (c) { if (c.data) porData[c.data] = c; }); // várias linhas no mesmo dia: vale a última
      const datas = Object.keys(porData).sort();
      if (datas.length < 2) return;
      const ult = porData[datas[datas.length - 1]];
      // o ritmo vem só das últimas 6 compras, para um hábito antigo não distorcer o de agora
      const rec = datas.slice(-6);
      const media = (dayNum(rec[rec.length - 1]) - dayNum(rec[0])) / (rec.length - 1);
      if (!(media >= 1)) return;
      const diasDesde = Math.max(0, Math.round(hoje - dayNum(ult.data)));
      // quem não compra mais (passou de 3 intervalos e de 90 dias) sai da lista em vez de ficar "acabando" para sempre
      if (diasDesde > 90 && diasDesde > 3 * media) return;
      const ratio = diasDesde / media;
      out.push({
        key: pr.key, nome: pr.nome, categoria: pr.categoria, nCompras: datas.length, ultimaData: ult.data, ultimoPreco: ult.vlUnit, ultimoTotal: ult.vlTotal,
        loja: ult.loja, intervalo: Math.round(media), diasDesde: diasDesde, ratio: ratio, acabando: ratio >= 0.8
      });
    });
    return out.sort(function (a, b) {
      if (a.acabando !== b.acabando) return a.acabando ? -1 : 1;
      if (a.acabando) return b.ratio - a.ratio;
      return b.nCompras - a.nCompras || a.nome.localeCompare(b.nome);
    });
  }

  function foldText(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }

  // Busca por produto ("Quanto paguei?"): todas as palavras digitadas precisam aparecer no nome
  // (sem acento, sem maiúsculas). Devolve a última compra e a de menor preço (por kg/litro quando
  // o tamanho é conhecido, senão por unidade). Em empate de preço, vale a mais recente.
  function lookupProducts(purchases, query, limit, todos) {
    const toks = foldText(query).split(/[^a-z0-9]+/).filter(Boolean);
    if (!toks.length && !todos) return [];
    const out = [];
    buildProducts(purchases).forEach(function (pr) {
      const hay = foldText([pr.nome].concat(pr.nomes).join(' '));
      if (!toks.every(function (t) { return hay.indexOf(t) >= 0; })) return;
      const lista = pr.compras.filter(function (c) { return c.vlUnit > 0 && isFinite(c.vlUnit); }).map(function (c) {
        return { data: c.data, loja: c.loja, vlUnit: c.vlUnit, un: c.un, qtd: c.qtd, up: unitPrice(pr, c) };
      });
      if (!lista.length) return;
      const ultima = lista[lista.length - 1];
      let menor = lista[0];
      lista.forEach(function (l) { if (l.up.valor <= menor.up.valor) menor = l; });
      out.push({ key: pr.key, nome: pr.nome, categoria: pr.categoria, nCompras: lista.length, ultima: ultima, menor: menor,
        menorEhUltima: menor === ultima, rotulo: ultima.up.rotulo, promoNaUltima: !(menor === ultima) && (ultima.up.valor - menor.up.valor) / menor.up.valor * 100 >= LIMITE_SUSPEITO });
    });
    out.sort(function (a, b) {
      if (a.nCompras !== b.nCompras) return b.nCompras - a.nCompras;
      const da = String(a.ultima.data || ''), db = String(b.ultima.data || '');
      return da === db ? a.nome.localeCompare(b.nome) : (da < db ? 1 : -1);
    });
    return out.slice(0, limit || 8);
  }

  // Todos os produtos já comprados (para a pessoa escolher o que pôr na lista), com o último preço.
  // Com texto, filtra como a busca; sem texto, devolve tudo (mais comprados primeiro).
  function catalogo(purchases, query, limit) {
    return lookupProducts(purchases, query, limit || 1000, true);
  }

  // Quantidade inicial sugerida: o que a pessoa levou da última vez (inteiro para unidade, até 3 casas para kg).
  function qtdSugerida(ultima) {
    const un = String((ultima && ultima.un) || '').toUpperCase();
    const q = ultima && ultima.qtd;
    if (un === 'KG' || un === 'L' || un === 'LT') return q > 0 && isFinite(q) ? Math.round(q * 1000) / 1000 : 1;
    return q >= 1 && isFinite(q) ? Math.round(q) : 1;
  }
  function passoQtd(un) { un = String(un || '').toUpperCase(); return (un === 'KG' || un === 'L' || un === 'LT') ? 0.5 : 1; }

  // Estimativa da lista. itens: {id, key, qtd, preco, feito}; precos: { key: valor unitário do último registro }.
  // Item conhecido usa o último preço registrado; item manual usa o preço digitado (opcional).
  // Itens sem nenhum preço ficam de fora do total e são contados em semPreco.
  function estimarLista(itens, precos) {
    precos = precos || {};
    let pendente = 0, carrinho = 0, semPreco = 0;
    (itens || []).forEach(function (it) {
      const p = it.key && precos[it.key] > 0 ? precos[it.key] : (it.preco > 0 ? it.preco : null);
      const q = it.qtd > 0 ? it.qtd : 1;
      if (p == null) { semPreco++; return; }
      if (it.feito) carrinho += p * q; else pendente += p * q;
    });
    const r = function (v) { return Math.round(v * 100) / 100; };
    return { pendente: r(pendente), carrinho: r(carrinho), total: r(pendente + carrinho), semPreco: semPreco };
  }

  // Valor digitado pela pessoa: aceita "900", "900,50", "1.200,00", "R$ 1200".
  function parseMoney(s) {
    let t = String(s == null ? '' : s).replace(/R\$|\s/gi, '');
    if (!t) return null;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ''); // "1.200" é mil e duzentos
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    const v = parseFloat(t);
    return v > 0 && v < 1e7 ? v : null;
  }

  // Meta de gasto do mês corrente (mês do calendário, não o da última nota).
  // 'perto' a partir de 80%; 'passou' acima de 100%. A projeção só aparece depois do dia 10, porque
  // antes disso uma compra grande distorce tudo.
  function goalStatus(purchases, meta, now) {
    if (!(meta > 0)) return null;
    now = now || new Date();
    const mes = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const dia = now.getDate(), diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    let gasto = 0, notas = 0;
    purchases.forEach(function (p) { if (monthKey(p.date) === mes) { gasto += p.total; notas++; } });
    gasto = Math.round(gasto * 100) / 100;
    const pct = gasto / meta * 100;
    const situacao = gasto > meta ? 'passou' : (pct >= 80 ? 'perto' : 'ok');
    const projecao = (notas > 0 && dia >= 10 && dia < diasMes) ? Math.round(gasto / dia * diasMes * 100) / 100 : null;
    return {
      mes: mes, meta: meta, gasto: gasto, notas: notas, pct: pct, situacao: situacao,
      restante: Math.round((meta - gasto) * 100) / 100, diasRestantes: diasMes - dia, projecao: projecao
    };
  }

  return {
    windowPurchases: windowPurchases, JANELA_MESES: JANELA_MESES, parseMoney: parseMoney, goalStatus: goalStatus, lookupProducts: lookupProducts, catalogo: catalogo, qtdSugerida: qtdSugerida, passoQtd: passoQtd, estimarLista: estimarLista, shrinkAlerts: shrinkAlerts, shoppingList: shoppingList,
    CATEGORIES: CATEGORIES, categorize: categorize, normalizeName: normalizeName, parseSize: parseSize,
    buildProducts: buildProducts, unitPrice: unitPrice, categoryTotals: categoryTotals, monthlyTotals: monthlyTotals, monthKey: monthKey,
    priceChanges: priceChanges, personalInflation: personalInflation, storeCompare: storeCompare, cutPotential: cutPotential,
    priceAlerts: priceAlerts, configure: configure, resolveKey: resolveKey, pairKey: pairKey, suggestMerges: suggestMerges, monthCompare: monthCompare
  };
});
