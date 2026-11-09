/* Proxy mínimo para o app (Cloudflare Worker).
 * Por que existe: o navegador não pode ler as páginas da SEFAZ direto (CORS).
 * O que faz: busca a página pública da nota e devolve o texto. Não guarda nada, não registra nada.
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
  async fetch(request) {
    const origin = request.headers.get('Origin');
    if (ALLOWED_ORIGINS.indexOf(origin) < 0) return new Response('Origem não permitida', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    const u = new URL(request.url).searchParams.get('u');
    if (!u) return new Response('Faltou o parâmetro u', { status: 400, headers: cors(origin) });
    let target;
    try { target = new URL(u); } catch (e) { return new Response('Endereço inválido', { status: 400, headers: cors(origin) }); }
    if (target.protocol !== 'https:' && target.protocol !== 'http:') return new Response('Protocolo não permitido', { status: 400, headers: cors(origin) });
    if (!allowedHost(target.hostname)) return new Response('Site não permitido', { status: 403, headers: cors(origin) });

    const r = await fetch(target.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NotasApp/0.1)', 'Accept': 'text/html,*/*' },
      redirect: 'follow'
    });
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) return new Response('Resposta grande demais', { status: 413, headers: cors(origin) });
    let text;
    try { text = new TextDecoder(charsetOf(r.headers.get('content-type'), buf)).decode(buf); }
    catch (e) { text = new TextDecoder('utf-8').decode(buf); }
    return new Response(text, { status: r.status, headers: cors(origin, { 'Content-Type': 'text/plain; charset=utf-8' }) });
  }
};
