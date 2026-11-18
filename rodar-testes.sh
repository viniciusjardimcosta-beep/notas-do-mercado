#!/usr/bin/env bash
# Roda todos os testes do projeto.
# Os testes esperam as pastas app/, site/ e worker/; aqui o repositório é publicado em outro formato
# (arquivos do app na raiz, página de apresentação em conheca/). Este script monta uma cópia temporária no
# formato esperado e roda lá, sem mexer em nada do repositório.
# Requer Node e o pacote "playwright" (com o Chromium) instalados.
set -e
RAIZ="$(cd "$(dirname "$0")" && pwd)"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/app" "$T/site" "$T/worker"
cp "$RAIZ"/{app.js,core.js,parser.js,jsQR.js,jsQR.LICENSE.txt,index.html,manifest.webmanifest,sw.js,privacidade.html,icon.svg} "$T/app/"
cp -r "$RAIZ/conheca/." "$T/site/"
cp "$RAIZ/worker.js" "$T/worker/worker.js"
cp -r "$RAIZ/tests" "$T/tests"
cd "$T"
for f in tests/unit.test.js tests/worker.test.js tests/site.test.js tests/browser.test.js; do
  echo "== $f"
  node "$f"
done
