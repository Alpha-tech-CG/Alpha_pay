#!/usr/bin/env bash
# Démo locale : fixe l'OTP d'un wallet à un code connu (pas de passerelle SMS en local).
# Usage : bash scripts/demo-otp.sh <phone> [code]
#   ex : bash scripts/demo-otp.sh 242066000099 123456
set -euo pipefail

PHONE="${1:?Usage: demo-otp.sh <phone> [code]}"
CODE="${2:-123456}"
CID="${PG_CONTAINER:-alphapay-postgres-1}"
DB="${PG_DB:-paybrain}"

# Hash argon2id du code, avec la lib de l'API (même algo que la vérification).
HASH="$(cd "$(dirname "$0")/../apps/api" && node -e "require('argon2').hash(process.argv[1],{type:require('argon2').argon2id}).then(h=>process.stdout.write(h))" "$CODE")"

# Applique : OTP connu, compteur remis à 0, expiration repoussée, statut en attente.
docker exec -i "$CID" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 <<SQL
UPDATE wallets
   SET otp_hash = '${HASH}',
       otp_attempts = 0,
       otp_expires_at = now() + interval '10 minutes',
       status = 'PENDING_VERIFICATION'
 WHERE phone = '${PHONE}';
SQL

echo "OTP du numéro ${PHONE} fixé à : ${CODE}"
