#!/usr/bin/env bash
# Installs the versioned pre-push gate only into this Git checkout.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [[ ! -f .githooks/pre-push ]]; then
  echo '[PHASSCODE] Hook versionado .githooks/pre-push nao encontrado.' >&2
  exit 1
fi

EXISTING="$(git config --local --get core.hooksPath || true)"
if [[ -n "$EXISTING" && "$EXISTING" != '.githooks' ]]; then
  echo "[PHASSCODE] Outro caminho de hooks ja configurado: $EXISTING" >&2
  echo '[PHASSCODE] Instalacao abortada para nao sobrescrever seus hooks.' >&2
  exit 1
fi

HOOKS_DIR="$(git rev-parse --git-path hooks)"
if [[ -z "$EXISTING" && -f "$HOOKS_DIR/pre-push" ]]; then
  echo '[PHASSCODE] Hook pre-push preexistente detectado. Instalacao abortada.' >&2
  exit 1
fi

chmod +x .githooks/pre-push
git config --local core.hooksPath .githooks

echo '[PHASSCODE] Pre-push habilitado neste checkout.'
echo '[PHASSCODE] Proximos pushes executarao npm run check, test:infrastructure e smoke.'
echo '[PHASSCODE] GitHub API e outros checkouts nao herdam automaticamente este hook.'
