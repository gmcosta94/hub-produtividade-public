#!/bin/bash
# Grava a chave da API da Anthropic nos segredos do projeto Supabase da nuvem,
# onde a função do assistente a lê (ANTHROPIC_API_KEY).
#
# Uso:  scripts/configurar_chave_da_api.sh
#
# Pede a chave sem mostrá-la na tela. Ela não fica no histórico do terminal nem
# em arquivo do projeto: passa por um arquivo temporário, apagado em seguida.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -s -p "Chave da API da Anthropic: " CHAVE; echo
if [ -z "$CHAVE" ]; then echo "Nenhuma chave digitada." >&2; exit 1; fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
chmod 600 "$TMP"
printf 'ANTHROPIC_API_KEY=%s\n' "$CHAVE" > "$TMP"
unset CHAVE

supabase secrets set --env-file "$TMP"
echo "Chave gravada. O assistente já pode ser usado em Plano."
