/* Proxy mínimo para o app (Cloudflare Worker).
 * Por que existe: o navegador não pode ler as páginas da SEFAZ direto (CORS).
 * O que faz: busca a página pública da nota e devolve o texto. Não guarda o conteúdo das notas.
 * Opcional: conta consultas por UF, de forma anônima (veja METRICAS abaixo).
 * Só aceita endereços de sites do governo (.gov.br) de fazenda/sefaz.
 */
const MAX_BYTES = 2 * 1024 * 1024;
// Só o seu app pode usar este proxy. Se mudar o endereço do app, mude aqui também.
// Durante a mudança de endereço, os dois ficam valendo; depois pode tirar o antigo.
const ALLOWED_ORIGINS = [
  'https://caderninhodomercado.com.br',
  'https://www.caderninhodomercado.com.br',
  'https://viniciusjardimcosta-beep.github.io'
];

// Limite de consultas por endereço de rede, contra scripts que gastariam a cota.
// 60 por minuto é folgado para uma pessoa (1 nota = 1 consulta) e aguenta várias pessoas atrás do mesmo IP de operadora.
// Guarda na memória do Worker: cada instância conta separado, então é um freio aproximado, não exato.
// Se existir um "Rate Limiting binding" chamado LIMITER (opcional, veja o README), ele é usado no lugar.
const LIMITE = 60, JANELA_MS = 60 * 1000, MAX_IPS = 5000;
const visitas = new Map();
function estourou(ip, agora) {
  let v = visitas.get(ip);
  if (!v || agora - v.ini >= JANELA_MS) { v = { ini: agora, n: 0 }; visitas.set(ip, v); }
  v.n++;
  if (visitas.size > MAX_IPS) { // limpeza: tira o que já venceu
    for (const [k, x] of visitas) if (agora - x.ini >= JANELA_MS) visitas.delete(k);
    if (visitas.size > MAX_IPS) visitas.clear();
  }
  return v.n > LIMITE;
}

// Contagem anônima (opcional): se existir um binding do Workers Analytics Engine chamado METRICAS,
// cada consulta vira um ponto com só duas informações: a UF (2 primeiros dígitos da chave) e se deu certo.
// Não grava a chave, o endereço, o IP nem qualquer dado da nota. Conta notas lidas, não pessoas.
const UF_POR_CODIGO = { 11: 'RO', 12: 'AC', 13: 'AM', 14: 'RR', 15: 'PA', 16: 'AP', 17: 'TO', 21: 'MA', 22: 'PI', 23: 'CE', 24: 'RN', 25: 'PB', 26: 'PE', 27: 'AL', 28: 'SE', 29: 'BA',
  31: 'MG', 32: 'ES', 33: 'RJ', 35: 'SP', 41: 'PR', 42: 'SC', 43: 'RS', 50: 'MS', 51: 'MT', 52: 'GO', 53: 'DF' };
function ufDaConsulta(u) {
  const m = /(?:^|\D)(\d{44})(?:\D|$)/.exec(String(u));
  return (m && UF_POR_CODIGO[+m[1].slice(0, 2)]) || 'outra';
}
function contar(env, u, ok) {
  try {
    if (env && env.METRICAS && typeof env.METRICAS.writeDataPoint === 'function') {
      const uf = ufDaConsulta(u);
      env.METRICAS.writeDataPoint({ blobs: [uf, ok ? 'ok' : 'erro'], doubles: [1], indexes: [uf] });
    }
  } catch (e) { /* contar nunca pode derrubar a consulta */ }
}

function allowedHost(h) {
  // sefa. = Pará (appnfc.sefa.pa.gov.br); set. = Rio Grande do Norte (domínio antigo, ancorado para não casar com "reset.")
  return h.endsWith('.gov.br') && /(fazenda|sefaz|sefin|sef\.|nfce|receita|svrs|dfe|(^|\.)(sefa|set)\.)/.test(h);
}

function cors(origin, extra) {
  return Object.assign({
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'no-store'
  }, extra || {});
}

function charsetOf(contentType, bytes) {
  let m = /charset=([\w-]+)/i.exec(contentType || '');
  if (m) return m[1];
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 2048));
  m = /charset=["']?([\w-]+)/i.exec(head);
  return m ? m[1] : 'utf-8';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    if (ALLOWED_ORIGINS.indexOf(origin) < 0) return new Response('Origem não permitida', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const u = new URL(request.url).searchParams.get('u');
    if (!u) return new Response('Faltou o parâmetro u', { status: 400, headers: cors(origin) });
    let target;
    try { target = new URL(u); } catch (e) { return new Response('Endereço inválido', { status: 400, headers: cors(origin) }); }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return new Response('Protocolo não permitido', { status: 400, headers: cors(origin) });
    if (!allowedHost(target.hostname)) return new Response('Site não permitido', { status: 403, headers: cors(origin) });

    const ip = request.headers.get('CF-Connecting-IP') || 'sem-ip';
    let barrado;
    if (env && env.LIMITER && typeof env.LIMITER.limit === 'function') barrado = !(await env.LIMITER.limit({ key: ip })).success;
    else barrado = estourou(ip, Date.now());
    if (barrado) return new Response('Muitas consultas seguidas. Espere um minuto.', { status: 429, headers: cors(origin, { 'Retry-After': '60' }) });

    const r = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NotasApp/0.1)', 'Accept': 'text/html,*/*' },
      redirect: 'follow'
    });
    contar(env, u, r.ok);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return new Response('Resposta grande demais', { status: 413, headers: cors(origin) });
    let text;
    try { text = new TextDecoder(charsetOf(r.headers.get('content-type'), buf)).decode(buf); }
    catch (e) { text = new TextDecoder('utf-8').decode(buf); }
    return new Response(text, { status: r.status, headers: cors(origin, { 'Content-Type': 'text/plain; charset=utf-8' }) });
  }
};
