// Lê as contagens anônimas do Worker (consultas por UF). Roda no seu computador, não faz parte do app.
// Uso:  CF_ACCOUNT_ID=... CF_API_TOKEN=... node worker/ler-metricas.js [dias]
// O token precisa só da permissão "Account Analytics: Read". Nunca coloque o token no repositório.
const dias = Math.max(1, Math.min(90, parseInt(process.argv[2], 10) || 30));
const id = process.env.CF_ACCOUNT_ID, token = process.env.CF_API_TOKEN;
if (!id || !token) { console.error('Defina CF_ACCOUNT_ID e CF_API_TOKEN.'); process.exit(1); }
const sql = "SELECT blob1 AS uf, blob2 AS resultado, SUM(_sample_interval) AS consultas FROM notas_consultas " +
  "WHERE timestamp > NOW() - INTERVAL '" + dias + "' DAY GROUP BY uf, resultado ORDER BY consultas DESC";
fetch('https://api.cloudflare.com/client/v4/accounts/' + id + '/analytics_engine/sql', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: sql })
  .then(r => r.text().then(t => { if (!r.ok) throw new Error(r.status + ' ' + t); return JSON.parse(t); }))
  .then(j => {
    const por = {};
    j.data.forEach(l => { const o = por[l.uf] || (por[l.uf] = { ok: 0, erro: 0 }); o[l.resultado] = +l.consultas; });
    console.log('Consultas nos últimos ' + dias + ' dias (notas lidas, não pessoas):');
    Object.keys(por).sort((a, b) => (por[b].ok + por[b].erro) - (por[a].ok + por[a].erro)).forEach(uf => {
      const o = por[uf]; console.log(uf.padEnd(6), String(o.ok + o.erro).padStart(6), ' (deram certo: ' + o.ok + ', erro: ' + o.erro + ')');
    });
  })
  .catch(e => { console.error('Falhou:', e.message); process.exit(1); });
