#!/usr/bin/env bash
# Génère un nouvel API User + API Key MTN MoMo (sandbox).
# Usage: ./rotate-mtn-sandbox.sh <SUBSCRIPTION_KEY>
set -euo pipefail

SUB_KEY="${1:-}"
if [ -z "$SUB_KEY" ]; then
  echo "Usage: $0 <SUBSCRIPTION_KEY>" >&2
  exit 1
fi

BASE="https://sandbox.momodeveloper.mtn.com"
# UUID v4 (nouvel API User ID)
REF=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || powershell -NoProfile -Command "[guid]::NewGuid().ToString()")
REF=$(echo "$REF" | tr -d '\r' | tr 'A-Z' 'a-z')

echo "Nouvel API User ID : $REF"

# 1) Créer l'API user
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/v1_0/apiuser" \
  -H "X-Reference-Id: $REF" \
  -H "Ocp-Apim-Subscription-Key: $SUB_KEY" \
  -H "Content-Type: application/json" \
  -d '{"providerCallbackHost":"https://example.com"}')
if [ "$code" != "201" ]; then
  echo "Echec creation API user (HTTP $code). Verifie la subscription key." >&2
  exit 1
fi
echo "API user cree (HTTP 201)."

# 2) Générer l'apiKey
API_KEY=$(curl -s -X POST "$BASE/v1_0/apiuser/$REF/apikey" \
  -H "Ocp-Apim-Subscription-Key: $SUB_KEY" \
  -H "Content-Length: 0" | sed -E 's/.*"apiKey":"([^"]+)".*/\1/')

echo
echo "=== A copier dans apps/api/.env ==="
echo "MTN_SUBSCRIPTION_KEY=$SUB_KEY"
echo "MTN_API_USER_ID=$REF"
echo "MTN_API_KEY=$API_KEY"
