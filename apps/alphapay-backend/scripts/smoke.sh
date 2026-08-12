#!/usr/bin/env bash
# Smoke test bout-en-bout du MVP alphapay-backend (stubs).
# Prérequis : backend lancé (BASE), Postgres + Redis up.
#   BASE=http://localhost:3000 bash scripts/smoke.sh
set -euo pipefail
BASE="${BASE:-http://localhost:3000}"
PHONE="+242069999001"
say() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
j() { python -c "import sys,json;print(json.load(sys.stdin)$1)"; }

say "register (envoi OTP)"; curl -fsS -X POST "$BASE/auth/register" -H 'Content-Type: application/json' \
  -d "{\"phoneNumber\":\"$PHONE\",\"market\":\"CONGO\"}"; echo

say "verify-otp -> tokens"
TOK=$(curl -fsS -X POST "$BASE/auth/verify-otp" -H 'Content-Type: application/json' \
  -d "{\"phoneNumber\":\"$PHONE\",\"otp\":\"123456\"}")
ACCESS=$(echo "$TOK" | j "['accessToken']")
echo "accessToken: ${ACCESS:0:24}…"
AUTH="Authorization: Bearer $ACCESS"

say "me (avant KYC)"; curl -fsS "$BASE/auth/me" -H "$AUTH"; echo

say "payment local SANS KYC -> doit être 403"
curl -s -o /dev/null -w "HTTP %{http_code} (attendu 403)\n" -X POST "$BASE/payments/local" -H "$AUTH" \
  -H 'Content-Type: application/json' -d '{"amount":5000,"currency":"XAF","operator":"MTN","phoneNumber":"+242060000009"}'

say "KYC submit niveau 2 (stub auto-approve)"
curl -fsS -X POST "$BASE/kyc/submit" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"level":"LEVEL_2","documentType":"passport"}'; echo

say "payment local APRÈS KYC -> SUCCESSFUL"
curl -fsS -X POST "$BASE/payments/local" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"amount":5000,"currency":"XAF","operator":"MTN","phoneNumber":"+242060000009"}'; echo

say "quote FX + payment international (corridor Congo->Libye via USDC)"
curl -fsS -X POST "$BASE/payments/international" -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"amount":50000,"sourceCurrency":"XAF","targetCurrency":"USDC","recipientPhone":"+218911234567","corridor":"CONGO_LIBYA"}'; echo

say "liste des transactions (doit être 2)"
curl -fsS "$BASE/payments" -H "$AUTH" | python -c "import sys,json;d=json.load(sys.stdin);print('nb transactions:',len(d))"; echo

say "OK — flux MVP complet"
